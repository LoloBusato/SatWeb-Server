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

function toMysqlDt(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function enumerateOccurrences(task, fromAR, toAR) {
    const out = [];
    const starts = new Date(task.starts_at);
    if (toAR < starts) return out;

    function applyTime(date) {
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

async function listActiveUsersInGroup(c, groupId) {
    const [rows] = await c.query(
        'SELECT idusers FROM users WHERE grupos_id = ? AND enabled = 1 AND deleted_at IS NULL',
        [groupId]
    );
    return rows.map(r => r.idusers);
}

async function tryInsert(c, task, userId, scheduledFor) {
    const dateOnly = scheduledFor.toISOString().slice(0, 10);
    const scheduledMysql = toMysqlDt(scheduledFor);
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
        console.log(`Ventana: ${toMysqlDt(nowAR)} → ${toMysqlDt(to)}\n`);

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
