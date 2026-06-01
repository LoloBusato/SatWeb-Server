const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

// ============================================================================
// task_instances — instancias materializadas de tareas. Cada usuario tiene
// su propia fila (las de grupo se fan-out al crear/cron). El /pending
// filtra por user_id directamente; /complete propaga a todo el grupo
// cuando la tarea madre es for_each_user=0.
// ============================================================================

router.get('/pending', (req, res) => {
    const userId = Number(req.query.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
        return res.status(400).json({ error: 'userId requerido' });
    }
    const q = `
        SELECT ti.*, t.title, t.description, t.can_postpone, t.for_each_user
        FROM task_instances ti
        JOIN tasks t ON t.id = ti.task_id
        WHERE t.deleted_at IS NULL
          AND ti.completed_at IS NULL
          AND (ti.postponed_until IS NULL OR ti.postponed_until <= CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND ti.scheduled_for <= CONVERT_TZ(NOW(), '+00:00', '-03:00')
          AND ti.assigned_to_user_id = ?
        ORDER BY ti.scheduled_for ASC
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [userId], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json(data);
        });
    });
});

// Completar. Si la tarea madre es for_each_user=0 (tarea de grupo
// compartida), marcamos TODAS las instancias del mismo task_id +
// scheduled_for como completadas — completar una vez "limpia" para
// todo el grupo. Si es individual (for_each_user=1), sólo la propia.
router.post('/:id/complete', async (req, res) => {
    const { id } = req.params;
    const completedBy = Number(req.body?.completed_by) || null;
    const db = await pool.promise().getConnection();
    try {
        const [[row]] = await db.execute(
            `SELECT ti.task_id, ti.scheduled_for, t.for_each_user
             FROM task_instances ti JOIN tasks t ON t.id = ti.task_id
             WHERE ti.id = ?`,
            [id]
        );
        if (!row) { db.release(); return res.status(404).json({ error: 'instancia no encontrada' }); }

        const setCompleted = `
            completed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
            completed_by = ?, status = 'completed'
        `;
        if (row.for_each_user === 0) {
            // Marcar todas las del mismo task_id + scheduled_for (no
            // completadas todavía). El completed_by queda con el usuario
            // que disparó la acción — útil para el historial.
            const [r] = await db.execute(
                `UPDATE task_instances SET ${setCompleted}
                 WHERE task_id = ? AND scheduled_for = ? AND completed_at IS NULL`,
                [completedBy, row.task_id, row.scheduled_for]
            );
            return res.status(200).json({ updated: r.affectedRows, propagated_to_group: true });
        } else {
            const [r] = await db.execute(
                `UPDATE task_instances SET ${setCompleted}
                 WHERE id = ? AND completed_at IS NULL`,
                [completedBy, id]
            );
            return res.status(200).json({ updated: r.affectedRows, propagated_to_group: false });
        }
    } catch (err) {
        console.error('complete', err);
        return res.status(500).send(err.message);
    } finally {
        db.release();
    }
});

router.post('/:id/postpone', (req, res) => {
    const { id } = req.params;
    const minutes = Number(req.body?.minutes) || 30;
    const q = `
        UPDATE task_instances
        SET postponed_until = DATE_ADD(CONVERT_TZ(NOW(), '+00:00', '-03:00'), INTERVAL ? MINUTE),
            postpone_count = postpone_count + 1,
            status = 'postponed'
        WHERE id = ? AND completed_at IS NULL
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [minutes, id], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ updated: data.affectedRows });
        });
    });
});

module.exports = router;
