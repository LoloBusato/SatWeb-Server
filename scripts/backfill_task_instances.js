// Backfill de task_instances para las próximas 24h — invoca la misma
// lógica que el cron diario (tasks-tick) pero directo contra prod DB
// con las credenciales de .env.local. Útil cuando SELF_BASE_URL no
// estaba configurada y el cron no generó las instancias.
//
// Idempotente: el helper insertInstances dedupea por
// (task_id, user_id, DATE(scheduled_for)).
//
// Uso:
//   node scripts/backfill_task_instances.js               (dry-run)
//   node scripts/backfill_task_instances.js --execute

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const EXECUTE = process.argv.includes('--execute');

// AR-tz independent helpers (espejo de CRUD/tasks.js — junio 2026, fix
// para que el script funcione igual desde Mac AR o Vercel UTC).
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
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return {
        year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
        hour: Number(hh), minute: Number(parts.minute), second: Number(parts.second),
        dow: DOW_MAP[parts.weekday],
    };
}

function addDays(ymd, n) {
    const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
    d.setUTCDate(d.getUTCDate() + n);
    return {
        year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
        dow: d.getUTCDay(), hour: 0, minute: 0, second: 0,
    };
}

function partsToMysql(p) {
    const pad = n => String(n).padStart(2, '0');
    return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

function partsToMs(p) {
    return Date.UTC(p.year, p.month - 1, p.day, p.hour || 0, p.minute || 0, p.second || 0);
}

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
        if (partsToMs(occ) >= partsToMs(from) && partsToMs(occ) <= partsToMs(to)) out.push(occ);
        return out;
    }

    const startsDayMs = Date.UTC(starts.year, starts.month - 1, starts.day);
    const fromDayMs = Date.UTC(from.year, from.month - 1, from.day);
    let cursor = startsDayMs >= fromDayMs
        ? { year: starts.year, month: starts.month, day: starts.day, dow: starts.dow, hour: 0, minute: 0, second: 0 }
        : { year: from.year, month: from.month, day: from.day, dow: from.dow, hour: 0, minute: 0, second: 0 };
    const toDayMs = Date.UTC(to.year, to.month - 1, to.day);

    while (Date.UTC(cursor.year, cursor.month - 1, cursor.day) <= toDayMs) {
        let matches = false;
        if (task.repeat_type === 'daily') matches = true;
        else if (task.repeat_type === 'weekly') matches = cursor.dow === Number(task.repeat_day_of_week);
        else if (task.repeat_type === 'biweekly') {
            if (cursor.dow === Number(task.repeat_day_of_week)) {
                const curMs = Date.UTC(cursor.year, cursor.month - 1, cursor.day);
                const daysDiff = Math.round((curMs - startsDayMs) / (24 * 3600 * 1000));
                matches = daysDiff >= 0 && Math.floor(daysDiff / 7) % 2 === 0;
            }
        } else if (task.repeat_type === 'monthly') matches = cursor.day === Number(task.repeat_day_of_month);

        if (matches) {
            const tod = pickTime();
            const occ = { year: cursor.year, month: cursor.month, day: cursor.day,
                          hour: tod.hour, minute: tod.minute, second: tod.second };
            const occMs = partsToMs(occ);
            if (occMs >= partsToMs(starts) && occMs >= partsToMs(from) && occMs <= partsToMs(to)) out.push(occ);
        }
        cursor = addDays(cursor, 1);
    }
    return out;
}

async function listActiveUsersInGroup(c, groupId) {
    const [rows] = await c.query(
        'SELECT idusers FROM users WHERE grupos_id = ? AND enabled = 1 AND deleted_at IS NULL',
        [groupId]
    );
    return rows.map(r => r.idusers);
}

async function tryInsert(c, task, userId, occParts) {
    const scheduledMysql = partsToMysql(occParts);
    const pad = n => String(n).padStart(2, '0');
    const dateOnly = `${occParts.year}-${pad(occParts.month)}-${pad(occParts.day)}`;
    const [existing] = await c.query(
        `SELECT 1 FROM task_instances
         WHERE task_id = ? AND assigned_to_user_id = ? AND DATE(scheduled_for) = ?
         LIMIT 1`,
        [task.id, userId, dateOnly]
    );
    if (existing.length > 0) return { inserted: false, scheduledMysql };
    if (!EXECUTE) return { inserted: 'would', scheduledMysql };
    await c.query(
        `INSERT INTO task_instances
         (task_id, assigned_to_user_id, assigned_to_group_id, scheduled_for, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [task.id, userId, task.assigned_to_group_id, scheduledMysql]
    );
    return { inserted: true, scheduledMysql };
}

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Modo: ${EXECUTE ? '🔴 EXECUTE' : '🟢 DRY-RUN'}\n`);

    try {
        const [[nowRow]] = await c.query("SELECT CONVERT_TZ(NOW(), '+00:00', '-03:00') AS now_ar");
        const nowAR = new Date(nowRow.now_ar);
        const to = new Date(nowAR.getTime() + 24 * 60 * 60 * 1000);
        console.log(`Ventana AR: ${partsToMysql(getARFields(nowAR))} → ${partsToMysql(getARFields(to))}\n`);

        const [tasks] = await c.query(
            `SELECT * FROM tasks WHERE deleted_at IS NULL AND repeat_type != 'none'`
        );
        console.log(`Tareas a procesar: ${tasks.length}\n`);

        const groupUsers = new Map();
        let totalInserted = 0, totalSkipped = 0, totalWould = 0;

        for (const task of tasks) {
            const occurrences = enumerateOccurrences(task, nowAR, to);
            if (occurrences.length === 0) {
                console.log(`  [—] '${task.title}' (grp=${task.assigned_to_group_id}, ${task.repeat_type}): sin ocurrencias en ventana`);
                continue;
            }
            const targets = [];
            if (task.assigned_to_user_id != null && task.assigned_to_group_id == null) {
                targets.push(task.assigned_to_user_id);
            } else if (task.assigned_to_group_id != null) {
                if (!groupUsers.has(task.assigned_to_group_id)) {
                    groupUsers.set(task.assigned_to_group_id, await listActiveUsersInGroup(c, task.assigned_to_group_id));
                }
                targets.push(...groupUsers.get(task.assigned_to_group_id));
            }
            for (const occ of occurrences) {
                for (const uid of targets) {
                    const r = await tryInsert(c, task, uid, occ);
                    if (r.inserted === true) totalInserted++;
                    else if (r.inserted === 'would') totalWould++;
                    else totalSkipped++;
                }
            }
            console.log(`  [${EXECUTE ? '✓' : '·'}] '${task.title}' grp=${task.assigned_to_group_id} | occ=${occurrences.length} × users=${targets.length}`);
        }

        console.log(`\nResumen: insertadas=${totalInserted} | a-insertar=${totalWould} | skip (ya existían)=${totalSkipped}`);
        if (!EXECUTE) console.log(`🟢 DRY-RUN — nada cambió. Pasá --execute.`);
    } finally {
        await c.end();
    }
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
