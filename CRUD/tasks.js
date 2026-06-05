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

// ============================================================================
// Helpers de tz — AR-tz independiente. enumerateOccurrences NO depende del
// timezone del runner. Antes usaba new Date(...).getDay() y setDate(), que
// en Vercel UTC daban el día de semana UTC. Hoy convertimos a AR via Intl
// y trabajamos con tuplas {year,month,day,dow,...} en calendario AR puro.
// ============================================================================
const AR_TZ = 'America/Buenos_Aires';
const AR_FMT = new Intl.DateTimeFormat('en-US', {
    timeZone: AR_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false,
});
const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function getARFields(date) {
    const parts = AR_FMT.formatToParts(date).reduce((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value;
        return acc;
    }, {});
    // hour='24' es bug de algunos polyfills — normalizar a '00'.
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(hh),
        minute: Number(parts.minute),
        second: Number(parts.second),
        dow: DOW_MAP[parts.weekday],
    };
}

// AR-cal arithmetic. AR no tiene DST desde 2008, así que iterar via UTC es seguro.
function addDays(ymd, n) {
    const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
    d.setUTCDate(d.getUTCDate() + n);
    return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        dow: d.getUTCDay(),
        hour: 0, minute: 0, second: 0,
    };
}

function partsToMysql(p) {
    const pad = n => String(n).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function partsToMs(p) {
    return Date.UTC(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0, p.second || 0);
}

// Devuelve la lista de ocurrencias (como AR-parts) que caen en la ventana
// [fromAR, toAR]. fromAR/toAR son Dates JS — los convertimos a AR-parts
// internamente para que el cálculo sea tz-independent.
function enumerateOccurrences(task, fromAR, toAR) {
    const out = [];
    const starts = getARFields(new Date(task.starts_at));
    const from = getARFields(fromAR);
    const to = getARFields(toAR);

    function pickTime() {
        if (task.is_random_time === 1 && task.random_time_from && task.random_time_to) {
            const [hf, mf, sf] = String(task.random_time_from).split(':').map(Number);
            const [ht, mt, st] = String(task.random_time_to).split(':').map(Number);
            const fromSec = (hf || 0) * 3600 + (mf || 0) * 60 + (sf || 0);
            const toSec = (ht || 0) * 3600 + (mt || 0) * 60 + (st || 0);
            const rand = fromSec + Math.floor(Math.random() * Math.max(1, toSec - fromSec));
            return { hour: Math.floor(rand / 3600), minute: Math.floor((rand % 3600) / 60), second: rand % 60 };
        }
        if (task.repeat_time) {
            const [h, m, s] = String(task.repeat_time).split(':').map(Number);
            return { hour: h || 0, minute: m || 0, second: s || 0 };
        }
        return { hour: starts.hour, minute: starts.minute, second: starts.second };
    }

    if (task.repeat_type === 'none') {
        const occ = { year: starts.year, month: starts.month, day: starts.day,
                      hour: starts.hour, minute: starts.minute, second: starts.second };
        if (partsToMs(occ) >= partsToMs(from) && partsToMs(occ) <= partsToMs(to)) {
            out.push(occ);
        }
        return out;
    }

    // Cursor en día calendario AR. Arrancamos en max(starts.day, from.day).
    const startsDayMs = Date.UTC(starts.year, starts.month - 1, starts.day);
    const fromDayMs = Date.UTC(from.year, from.month - 1, from.day);
    let cursor = startsDayMs >= fromDayMs
        ? { year: starts.year, month: starts.month, day: starts.day, dow: starts.dow, hour: 0, minute: 0, second: 0 }
        : { year: from.year, month: from.month, day: from.day, dow: from.dow, hour: 0, minute: 0, second: 0 };
    const toDayMs = Date.UTC(to.year, to.month - 1, to.day);

    while (Date.UTC(cursor.year, cursor.month - 1, cursor.day) <= toDayMs) {
        let matches = false;
        // Negocio cerrado fines de semana — daily/weekly nunca caen en
        // sábado (dow=6) ni domingo (dow=0). biweekly y monthly se dejan
        // como están (no había feedback sobre esos por ahora).
        const isWeekend = cursor.dow === 0 || cursor.dow === 6;
        if (task.repeat_type === 'daily') {
            matches = !isWeekend;
        } else if (task.repeat_type === 'weekly') {
            const targetDow = Number(task.repeat_day_of_week);
            const targetIsWeekend = targetDow === 0 || targetDow === 6;
            matches = !targetIsWeekend && cursor.dow === targetDow;
        } else if (task.repeat_type === 'biweekly') {
            if (cursor.dow === Number(task.repeat_day_of_week)) {
                const curMs = Date.UTC(cursor.year, cursor.month - 1, cursor.day);
                const daysDiff = Math.round((curMs - startsDayMs) / (24 * 3600 * 1000));
                matches = daysDiff >= 0 && Math.floor(daysDiff / 7) % 2 === 0;
            }
        } else if (task.repeat_type === 'monthly') {
            matches = cursor.day === Number(task.repeat_day_of_month);
        }
        if (matches) {
            const tod = pickTime();
            const occ = { year: cursor.year, month: cursor.month, day: cursor.day,
                          hour: tod.hour, minute: tod.minute, second: tod.second };
            const occMs = partsToMs(occ);
            if (occMs >= partsToMs(starts) && occMs >= partsToMs(from) && occMs <= partsToMs(to)) {
                out.push(occ);
            }
        }
        cursor = addDays(cursor, 1);
    }
    return out;
}

// Inserta instancias para una ocurrencia (AR-parts). Fan-out por usuario
// activo cuando hay grupo. Dedup por (task_id, user_id, DATE(scheduled_for))
// — esencial para is_random_time donde el HH:MM cambia cada cron.
async function insertInstances(db, task, occParts) {
    let inserted = 0;
    const scheduledMysql = partsToMysql(occParts);
    const pad = n => String(n).padStart(2, '0');
    const dateOnly = `${occParts.year}-${pad(occParts.month)}-${pad(occParts.day)}`;

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
