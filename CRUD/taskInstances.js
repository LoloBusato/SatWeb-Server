const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

// ============================================================================
// task_instances — instancias materializadas de tareas. Cada usuario tiene
// su propia fila (las de grupo se fan-out al crear/cron). El /pending
// filtra por user_id directamente; /complete propaga a todo el grupo
// cuando la tarea madre es for_each_user=0.
// ============================================================================

// /pending devuelve TODAS las instancias no completadas del usuario
// (vencidas + futuras). El frontend separa en dos buckets según
// effectiveTime = postponed_until ?? scheduled_for vs NOW:
//   - effective <= NOW → "Acciones para hacer ahora" (full UI)
//   - effective > NOW  → "Tareas del día" (apagada, sin postergar)
// useTaskNotifier hace el mismo split y dispara alarma cuando una
// instancia transiciona de futuro a vencida entre polls.
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

// GET /log?group_id=X&days=N — actividad reciente de tareas asignadas al
// grupo. Devuelve hasta los últimos N días (default 5) con TODOS los
// status para alimentar el feed del panel admin. El cron borra las
// completadas/postergadas viejas (ver internal/tasks-cleanup), las
// pendientes sobreviven.
router.get('/log', (req, res) => {
    const groupId = Number(req.query.group_id);
    const days = Number(req.query.days) || 5;
    if (!Number.isFinite(groupId) || groupId <= 0) {
        return res.status(400).json({ error: 'group_id requerido' });
    }
    const q = `
        SELECT ti.id, ti.task_id, ti.scheduled_for, ti.completed_at,
               ti.postponed_until, ti.postpone_count, ti.status,
               ti.assigned_to_user_id, ti.completed_by,
               t.title, t.for_each_user,
               COALESCE(cu.username, au.username) AS username
        FROM task_instances ti
        JOIN tasks t ON t.id = ti.task_id
        LEFT JOIN users cu ON cu.idusers = ti.completed_by
        LEFT JOIN users au ON au.idusers = ti.assigned_to_user_id
        WHERE t.deleted_at IS NULL
          AND t.assigned_to_group_id = ?
          AND ti.scheduled_for >= DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '-03:00'), INTERVAL ? DAY)
        ORDER BY ti.scheduled_for DESC, ti.id DESC
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [groupId, days], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json(data);
        });
    });
});

// POST /internal/tasks-cleanup — invocado por el cron diario. Borra
// task_instances de más de 5 días con status completed o postponed
// (las pending sobreviven por si todavía se quieren completar).
router.post('/internal/tasks-cleanup', (req, res) => {
    const cronSecret = process.env.CRON_SECRET || '';
    if (!cronSecret) return res.status(503).json({ error: 'CRON_SECRET no configurada' });
    const header = req.headers.authorization || '';
    if (header !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'unauthorized' });

    const q = `
        DELETE FROM task_instances
        WHERE scheduled_for < DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '-03:00'), INTERVAL 5 DAY)
          AND status IN ('completed', 'postponed')
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ deleted: data.affectedRows });
        });
    });
});

module.exports = router;
