const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

// ============================================================================
// Sistema de tareas (migrations 0027 + 0028).
//
// Modelo:
//   tasks            — definición (config). Una fila por "tarea madre".
//   task_instances   — ocurrencias materializadas. Cada usuario afectado
//                      tiene su propia fila por scheduled_for, así puede
//                      marcar completada / postergar individualmente. Si la
//                      tarea NO es individual (for_each_user=0), completar
//                      una propaga al resto via UPDATE … WHERE task_id+
//                      scheduled_for (lógica en /complete).
//
// Estrategia de fan-out (siempre que assigned_to_group_id != null):
//   - Listamos los usuarios activos del grupo
//   - Insertamos UNA fila por usuario con su user_id explícito
//   - UNIQUE (task_id, user_id, scheduled_for) → idempotencia del cron
//
// Para tareas de usuario específico (assigned_to_user_id != null en tasks),
// se crea sólo esa instancia, sin fan-out.
// ============================================================================

function listActiveUsersInGroup(db, groupId) {
    return new Promise((resolve, reject) => {
        db.query(
            'SELECT idusers FROM users WHERE grupos_id = ? AND enabled = 1 AND deleted_at IS NULL',
            [groupId],
            (err, rows) => err ? reject(err) : resolve(rows.map(r => r.idusers)),
        );
    });
}

function toMysqlDt(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper: dado [from, to] (Dates wall-clock AR), enumera las ocurrencias
// de una task según repeat_type. Para is_random_time=1 elige un instante
// aleatorio dentro del día entre random_time_from y random_time_to.
function enumerateOccurrences(task, fromAR, toAR) {
    const out = [];
    const starts = new Date(task.starts_at);
    if (toAR < starts) return out;

    function applyTime(date) {
        // Si is_random_time, elegir hh:mm:ss random dentro de la ventana.
        // Si no, usar repeat_time si existe, sino la hora de starts_at.
        if (task.is_random_time === 1 && task.random_time_from && task.random_time_to) {
            const [hf, mf, sf] = String(task.random_time_from).split(':').map(Number);
            const [ht, mt, st] = String(task.random_time_to).split(':').map(Number);
            const fromSec = (hf || 0) * 3600 + (mf || 0) * 60 + (sf || 0);
            const toSec = (ht || 0) * 3600 + (mt || 0) * 60 + (st || 0);
            const rand = fromSec + Math.floor(Math.random() * Math.max(1, toSec - fromSec));
            const hh = Math.floor(rand / 3600);
            const mm = Math.floor((rand % 3600) / 60);
            const ss = rand % 60;
            date.setHours(hh, mm, ss, 0);
            return;
        }
        let hh = starts.getHours(), mm = starts.getMinutes(), ss = starts.getSeconds();
        if (task.repeat_time) {
            const [h, m, s] = String(task.repeat_time).split(':').map(Number);
            if (Number.isFinite(h)) hh = h;
            if (Number.isFinite(m)) mm = m;
            if (Number.isFinite(s)) ss = s;
        }
        date.setHours(hh, mm, ss, 0);
    }

    if (task.repeat_type === 'none') {
        if (starts >= fromAR && starts <= toAR) out.push(new Date(starts));
        return out;
    }

    const cursor = new Date(Math.max(starts.getTime(), fromAR.getTime()));
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toAR);
    const startsDay = new Date(starts);
    startsDay.setHours(0, 0, 0, 0);

    while (cursor <= end) {
        let matches = false;
        if (task.repeat_type === 'daily') {
            matches = true;
        } else if (task.repeat_type === 'weekly') {
            matches = cursor.getDay() === Number(task.repeat_day_of_week);
        } else if (task.repeat_type === 'biweekly') {
            // Cada 2 semanas a partir de starts_at, en el día de semana
            // configurado. Sólo matchea si el día es correcto Y la
            // diferencia en semanas es par.
            if (cursor.getDay() === Number(task.repeat_day_of_week)) {
                const daysDiff = Math.round((cursor.getTime() - startsDay.getTime()) / (24 * 3600 * 1000));
                matches = daysDiff >= 0 && Math.floor(daysDiff / 7) % 2 === 0;
            }
        } else if (task.repeat_type === 'monthly') {
            matches = cursor.getDate() === Number(task.repeat_day_of_month);
        }
        if (matches) {
            const occ = new Date(cursor);
            applyTime(occ);
            if (occ >= starts && occ >= fromAR && occ <= toAR) out.push(occ);
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return out;
}

// Helper: inserta instancias para una occurrence. Para tareas con grupo,
// fan-out a cada usuario activo. Dedup por (task_id, user_id, DATE(scheduled_for))
// — esencial para is_random_time donde el HH:MM cambia cada cron.
async function insertInstances(db, task, scheduledFor) {
    let inserted = 0;
    const dateOnly = scheduledFor.toISOString().slice(0, 10);
    const scheduledMysql = toMysqlDt(scheduledFor);

    async function tryInsert(userId) {
        // Dedup por día — evita duplicados cuando is_random_time cambia
        // el HH:MM entre runs. Para tareas no random el UNIQUE constraint
        // también nos cubre, pero el SELECT por DATE() es más amplio y
        // funciona en ambos casos.
        const [existing] = await db.execute(
            `SELECT 1 FROM task_instances
             WHERE task_id = ? AND assigned_to_user_id = ? AND DATE(scheduled_for) = ?
             LIMIT 1`,
            [task.id, userId, dateOnly]
        );
        if (existing.length > 0) return 0;
        const [r] = await db.execute(
            `INSERT INTO task_instances
             (task_id, assigned_to_user_id, assigned_to_group_id, scheduled_for, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [task.id, userId, task.assigned_to_group_id, scheduledMysql]
        );
        return r.affectedRows;
    }

    if (task.assigned_to_user_id != null && task.assigned_to_group_id == null) {
        inserted += await tryInsert(task.assigned_to_user_id);
    } else if (task.assigned_to_group_id != null) {
        // Fan-out: una instancia por usuario activo del grupo. Aplica para
        // for_each_user=0 (todos ven la misma tarea — completar una marca
        // a todas via /complete) y for_each_user=1 (cada uno la suya).
        const userIds = await listActiveUsersInGroup({
            query: (q, p, cb) => db.execute(q, p).then(([r]) => cb(null, r)).catch(cb),
        }, task.assigned_to_group_id);
        for (const uid of userIds) {
            inserted += await tryInsert(uid);
        }
    }
    return inserted;
}

// ============================================================================
// Endpoints
// ============================================================================

router.get('/', (req, res) => {
    const q = `
        SELECT t.*, g.grupo AS group_name, u.username AS user_name,
               cb.username AS creator_name
        FROM tasks t
        LEFT JOIN grupousuarios g ON g.idgrupousuarios = t.assigned_to_group_id
        LEFT JOIN users u ON u.idusers = t.assigned_to_user_id
        LEFT JOIN users cb ON cb.idusers = t.created_by
        WHERE t.deleted_at IS NULL
        ORDER BY t.id DESC
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json(data);
        });
    });
});

router.post('/', async (req, res) => {
    const {
        title, description = null,
        assigned_to_group_id = null, assigned_to_user_id = null,
        for_each_user = 0, can_postpone = 1,
        repeat_type = 'none', repeat_time = null,
        repeat_day_of_week = null, repeat_day_of_month = null,
        is_random_time = 0, random_time_from = null, random_time_to = null,
        starts_at, created_by,
    } = req.body;

    if (!title || !starts_at || !created_by) {
        return res.status(400).json({ error: 'title, starts_at y created_by son requeridos' });
    }
    if (assigned_to_group_id == null && assigned_to_user_id == null) {
        return res.status(400).json({ error: 'Asignar a un grupo o usuario' });
    }

    const db = await pool.promise().getConnection();
    try {
        const [r] = await db.execute(
            `INSERT INTO tasks
              (title, description, assigned_to_group_id, assigned_to_user_id,
               for_each_user, can_postpone, repeat_type, repeat_time,
               repeat_day_of_week, repeat_day_of_month,
               is_random_time, random_time_from, random_time_to,
               starts_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, assigned_to_group_id, assigned_to_user_id,
             for_each_user, can_postpone, repeat_type, repeat_time,
             repeat_day_of_week, repeat_day_of_month,
             is_random_time, random_time_from, random_time_to,
             starts_at, created_by]
        );
        const taskId = r.insertId;

        const [[task]] = await db.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);
        const [[nowRow]] = await db.execute("SELECT CONVERT_TZ(NOW(), '+00:00', '-03:00') AS now_ar");
        const nowAR = new Date(nowRow.now_ar);
        const to = new Date(nowAR.getTime() + 24 * 60 * 60 * 1000);
        const from = new Date(Math.min(nowAR.getTime(), new Date(task.starts_at).getTime()));
        const occurrences = enumerateOccurrences(task, from, to);
        let inserted = 0;
        for (const occ of occurrences) {
            inserted += await insertInstances(db, task, occ);
        }
        return res.status(200).json({ id: taskId, instances_created: inserted });
    } catch (err) {
        console.error('POST /tasks', err);
        return res.status(500).send(err.message);
    } finally {
        db.release();
    }
});

router.put('/:id', (req, res) => {
    const { id } = req.params;
    const {
        title, description = null,
        assigned_to_group_id = null, assigned_to_user_id = null,
        for_each_user = 0, can_postpone = 1,
        repeat_type = 'none', repeat_time = null,
        repeat_day_of_week = null, repeat_day_of_month = null,
        is_random_time = 0, random_time_from = null, random_time_to = null,
        starts_at,
    } = req.body;
    const q = `UPDATE tasks SET
        title = ?, description = ?, assigned_to_group_id = ?, assigned_to_user_id = ?,
        for_each_user = ?, can_postpone = ?, repeat_type = ?, repeat_time = ?,
        repeat_day_of_week = ?, repeat_day_of_month = ?,
        is_random_time = ?, random_time_from = ?, random_time_to = ?,
        starts_at = ?
        WHERE id = ? AND deleted_at IS NULL`;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [title, description, assigned_to_group_id, assigned_to_user_id,
            for_each_user, can_postpone, repeat_type, repeat_time,
            repeat_day_of_week, repeat_day_of_month,
            is_random_time, random_time_from, random_time_to,
            starts_at, id], (err) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ updated: true });
        });
    });
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query('UPDATE tasks SET deleted_at = NOW() WHERE id = ?', [id], (err) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ deleted: true });
        });
    });
});

router.get('/:id/history', (req, res) => {
    const { id } = req.params;
    const q = `
        SELECT ti.*, u.username AS assigned_username, cu.username AS completed_username
        FROM task_instances ti
        LEFT JOIN users u ON u.idusers = ti.assigned_to_user_id
        LEFT JOIN users cu ON cu.idusers = ti.completed_by
        WHERE ti.task_id = ?
        ORDER BY ti.scheduled_for DESC
        LIMIT 200
    `;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [id], (err, data) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json(data);
        });
    });
});

// Internal endpoint para el cron diario — genera instancias de tareas
// repetitivas en las próximas 24h. Auth via Bearer CRON_SECRET.
router.post('/internal/tasks-tick', async (req, res) => {
    const cronSecret = process.env.CRON_SECRET || '';
    if (!cronSecret) return res.status(503).json({ error: 'CRON_SECRET no configurada' });
    const header = req.headers.authorization || '';
    if (header !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'unauthorized' });

    const db = await pool.promise().getConnection();
    try {
        const [tasks] = await db.execute(
            `SELECT * FROM tasks WHERE deleted_at IS NULL AND repeat_type != 'none'`
        );
        const [[nowRow]] = await db.execute("SELECT CONVERT_TZ(NOW(), '+00:00', '-03:00') AS now_ar");
        const nowAR = new Date(nowRow.now_ar);
        const to = new Date(nowAR.getTime() + 24 * 60 * 60 * 1000);
        let total = 0;
        for (const task of tasks) {
            const occurrences = enumerateOccurrences(task, nowAR, to);
            for (const occ of occurrences) {
                total += await insertInstances(db, task, occ);
            }
        }
        return res.status(200).json({ instances_created: total, tasks_processed: tasks.length });
    } catch (err) {
        console.error('tasks-tick', err);
        return res.status(500).send(err.message);
    } finally {
        db.release();
    }
});

module.exports = router;
