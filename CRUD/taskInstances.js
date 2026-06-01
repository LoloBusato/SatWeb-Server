const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

// ============================================================================
// Endpoints sobre task_instances (parte del sistema de tareas, migration 0027).
// ============================================================================

// GET /pending?userId=X&grupoId=Y — instancias visibles para el usuario.
// Convención:
//   - assigned_to_user_id === userId  → tarea personal directa
//   - assigned_to_user_id === 0 AND assigned_to_group_id === grupoId
//                                     → tarea de grupo (sentinel 0 al crear)
// Filtros:
//   - scheduled_for <= NOW
//   - completed_at IS NULL
//   - postponed_until IS NULL OR postponed_until <= NOW
router.get('/pending', (req, res) => {
    const userId = Number(req.query.userId);
    const grupoId = Number(req.query.grupoId);
    if (!Number.isFinite(userId) && !Number.isFinite(grupoId)) {
        return res.status(400).json({ error: 'userId o grupoId requeridos' });
    }
    const q = `
        SELECT ti.*, t.title, t.description, t.can_postpone, t.for_each_user
        FROM task_instances ti
        JOIN tasks t ON t.id = ti.task_id
        WHERE t.deleted_at IS NULL
          AND ti.completed_at IS NULL
          AND (ti.postponed_until IS NULL OR ti.postponed_until <= CONVERT_TZ(NOW(), '+00:00', '-03:00'))
          AND ti.scheduled_for <= CONVERT_TZ(NOW(), '+00:00', '-03:00')
          AND (
                (ti.assigned_to_user_id = ?)
             OR (ti.assigned_to_user_id = 0 AND ti.assigned_to_group_id = ?)
          )
        ORDER BY ti.scheduled_for ASC
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [userId || -1, grupoId || -1], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json(data);
        });
    });
});

// POST /:id/complete — marcar completada. Si la tarea es for_each_user=0
// (de grupo) y la instancia tiene sentinel user_id=0, también marca la
// instancia "hermana" si la había duplicada — pero el unique constraint
// la evita, así que basta con la fila propia.
router.post('/:id/complete', (req, res) => {
    const { id } = req.params;
    const completedBy = Number(req.body?.completed_by) || null;
    const q = `
        UPDATE task_instances
        SET completed_at = CONVERT_TZ(NOW(), '+00:00', '-03:00'),
            completed_by = ?,
            status = 'completed'
        WHERE id = ? AND completed_at IS NULL
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [completedBy, id], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ updated: data.affectedRows });
        });
    });
});

// POST /:id/postpone — postergar N minutos.
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
