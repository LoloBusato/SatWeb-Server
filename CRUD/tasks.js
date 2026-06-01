const express = require('express');
const router = express.Router();
const pool = require('../database/dbConfig');

// ============================================================================
// Sistema de tareas (migration 0027). Tareas con repetición opcional que se
// materializan en task_instances por usuario+fecha. Cada usuario afectado
// ve sus instancias pendientes en TasksSection (frontend); el cron diario
// agrega instancias futuras de las tareas repetitivas.
//
// Convenciones tz: igual que el resto — wall-clock AR via
// CONVERT_TZ(NOW(), '+00:00', '-03:00') al insertar/comparar.
// ============================================================================

// Helper: lista de userIds activos de un grupo (sin deshabilitados ni baja).
function listActiveUsersInGroup(db, groupId) {
    return new Promise((resolve, reject) => {
        db.query(
            'SELECT idusers FROM users WHERE grupos_id = ? AND enabled = 1 AND deleted_at IS NULL',
            [groupId],
            (err, rows) => err ? reject(err) : resolve(rows.map(r => r.idusers)),
        );
    });
}

// Helper: dado un Date "next occurrence" y task config, genera instancias en
// task_instances con UNIQUE (task_id, user_id, scheduled_for) — duplicados
// se ignoran con INSERT IGNORE. Devuelve cuántas se insertaron.
//
// scheduledForMysql debe ser un string 'YYYY-MM-DD HH:MM:SS' en wall-clock AR.
async function insertInstances(db, task, scheduledForMysql) {
    const qIns = `INSERT IGNORE INTO task_instances
        (task_id, assigned_to_user_id, assigned_to_group_id, scheduled_for, status)
        VALUES (?, ?, ?, ?, 'pending')`;
    let inserted = 0;

    if (task.for_each_user === 1 && task.assigned_to_group_id != null) {
        const userIds = await listActiveUsersInGroup(db, task.assigned_to_group_id);
        for (const uid of userIds) {
            const [r] = await db.promise().query(qIns,
                [task.id, uid, task.assigned_to_group_id, scheduledForMysql]);
            inserted += r.affectedRows;
        }
    } else if (task.assigned_to_user_id != null) {
        // Usuario específico — assigned_to_user_id es el destino.
        const [r] = await db.promise().query(qIns,
            [task.id, task.assigned_to_user_id, task.assigned_to_group_id, scheduledForMysql]);
        inserted += r.affectedRows;
    } else if (task.assigned_to_group_id != null) {
        // Tarea de grupo (no individual). Usamos un userId sentinel = 0 para
        // que UNIQUE no nos arme una fila por cada miembro; el frontend la
        // muestra a cualquier usuario del grupo cuando consulta /pending.
        const [r] = await db.promise().query(qIns,
            [task.id, 0, task.assigned_to_group_id, scheduledForMysql]);
        inserted += r.affectedRows;
    }
    return inserted;
}

// Helper: arma un string MySQL 'YYYY-MM-DD HH:MM:SS' desde un Date.
function toMysqlDt(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Helper: dado un task config + ventana [fromAR, toAR] (Dates en wall-clock
// AR — los obtenemos haciendo CONVERT_TZ en la query inicial), enumera las
// ocurrencias dentro de la ventana. Lógica simple: avanzar día a día desde
// max(starts_at, fromAR) hasta toAR, chequear si ese día matchea repeat_type
// y armar el Date con repeat_time.
function enumerateOccurrences(task, fromAR, toAR) {
    const out = [];
    const starts = new Date(task.starts_at);
    if (toAR < starts) return out;

    // Para tareas sin repetición: una única ocurrencia en starts_at (si cae
    // dentro de la ventana). El POST /tasks ya inserta la instancia inicial,
    // así que el cron generalmente no la toca; mantenerla acá igual asegura
    // recuperación si algo falla.
    if (task.repeat_type === 'none') {
        if (starts >= fromAR && starts <= toAR) out.push(new Date(starts));
        return out;
    }

    // Hora del día — usa repeat_time si existe, sino la hora de starts_at.
    let hh = starts.getHours(), mm = starts.getMinutes(), ss = starts.getSeconds();
    if (task.repeat_time) {
        const [h, m, s] = String(task.repeat_time).split(':').map(Number);
        if (Number.isFinite(h)) hh = h;
        if (Number.isFinite(m)) mm = m;
        if (Number.isFinite(s)) ss = s;
    }

    // Iteramos día por día desde el max(starts, fromAR) hasta toAR.
    const cursor = new Date(Math.max(starts.getTime(), fromAR.getTime()));
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(toAR);
    while (cursor <= end) {
        let matches = false;
        if (task.repeat_type === 'daily') {
            matches = true;
        } else if (task.repeat_type === 'weekly') {
            matches = cursor.getDay() === Number(task.repeat_day_of_week);
        } else if (task.repeat_type === 'monthly') {
            matches = cursor.getDate() === Number(task.repeat_day_of_month);
        }
        if (matches) {
            const occ = new Date(cursor);
            occ.setHours(hh, mm, ss, 0);
            if (occ >= starts && occ >= fromAR && occ <= toAR) out.push(occ);
        }
        cursor.setDate(cursor.getDate() + 1);
    }
    return out;
}

// ============================================================================
// Endpoints
// ============================================================================

// GET / — lista todas las tareas (panel admin).
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

// POST / — crear tarea + generar instancia(s) iniciales.
router.post('/', async (req, res) => {
    const {
        title, description = null,
        assigned_to_group_id = null, assigned_to_user_id = null,
        for_each_user = 0, can_postpone = 1,
        repeat_type = 'none', repeat_time = null,
        repeat_day_of_week = null, repeat_day_of_month = null,
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
               repeat_day_of_week, repeat_day_of_month, starts_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, description, assigned_to_group_id, assigned_to_user_id,
             for_each_user, can_postpone, repeat_type, repeat_time,
             repeat_day_of_week, repeat_day_of_month, starts_at, created_by]
        );
        const taskId = r.insertId;

        // Generar instancias para las próximas 24h (cubre el caso "tarea
        // creada para ya/hoy" sin esperar al cron).
        const [[task]] = await db.execute('SELECT * FROM tasks WHERE id = ?', [taskId]);
        const [[nowRow]] = await db.execute(
            "SELECT CONVERT_TZ(NOW(), '+00:00', '-03:00') AS now_ar"
        );
        const nowAR = new Date(nowRow.now_ar);
        const to = new Date(nowAR.getTime() + 24 * 60 * 60 * 1000);
        const from = new Date(Math.min(nowAR.getTime(), new Date(task.starts_at).getTime()));
        const occurrences = enumerateOccurrences(task, from, to);
        for (const occ of occurrences) {
            await insertInstances(db, task, toMysqlDt(occ));
        }

        return res.status(200).json({ id: taskId, instances_created: occurrences.length });
    } catch (err) {
        console.error('POST /tasks', err);
        return res.status(500).send(err.message);
    } finally {
        db.release();
    }
});

// PUT /:id — editar tarea (no toca instancias pasadas).
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const {
        title, description = null,
        assigned_to_group_id = null, assigned_to_user_id = null,
        for_each_user = 0, can_postpone = 1,
        repeat_type = 'none', repeat_time = null,
        repeat_day_of_week = null, repeat_day_of_month = null,
        starts_at,
    } = req.body;
    const q = `UPDATE tasks SET
        title = ?, description = ?, assigned_to_group_id = ?, assigned_to_user_id = ?,
        for_each_user = ?, can_postpone = ?, repeat_type = ?, repeat_time = ?,
        repeat_day_of_week = ?, repeat_day_of_month = ?, starts_at = ?
        WHERE id = ? AND deleted_at IS NULL`;
    pool.getConnection((err, db) => {
        if (err) return res.status(500).send(err);
        db.query(q, [title, description, assigned_to_group_id, assigned_to_user_id,
            for_each_user, can_postpone, repeat_type, repeat_time,
            repeat_day_of_week, repeat_day_of_month, starts_at, id], (err) => {
            db.release();
            if (err) return res.status(500).send(err);
            return res.status(200).json({ updated: true });
        });
    });
});

// DELETE /:id — soft delete.
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

// GET /:id/history — historial de instancias de una tarea.
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

// POST /internal/tasks-tick — endpoint interno llamado por el cron diario
// para generar instancias de tareas repetitivas en las próximas 24h.
// Idempotente: el UNIQUE (task_id, user_id, scheduled_for) ignora dups.
// Auth via Bearer CRON_SECRET.
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
        const [[nowRow]] = await db.execute(
            "SELECT CONVERT_TZ(NOW(), '+00:00', '-03:00') AS now_ar"
        );
        const nowAR = new Date(nowRow.now_ar);
        const to = new Date(nowAR.getTime() + 24 * 60 * 60 * 1000);
        let total = 0;
        for (const task of tasks) {
            const occurrences = enumerateOccurrences(task, nowAR, to);
            for (const occ of occurrences) {
                total += await insertInstances(db, task, toMysqlDt(occ));
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
