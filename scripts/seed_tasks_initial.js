// Carga inicial de tareas para Atención al Cliente (grupo 14) y
// Laboratorio Principal Belgrano (grupo 13). Tomado del spec
// (junio 2026). Idempotente — busca por title + assigned_to_group_id
// + repeat_day_of_week + repeat_time antes de insertar.
//
// Uso:
//   node scripts/seed_tasks_initial.js               (dry-run)
//   node scripts/seed_tasks_initial.js --execute

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const EXECUTE = process.argv.includes('--execute');
const ATENCION_GROUP = 14;
const LAB_GROUP = 13;
const ADMIN_GROUP = 19;

// 0=domingo ... 6=sábado (convención getDay() + repeat_day_of_week).
const D = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

const TASKS = [
    // === DIARIAS ATENCIÓN AL CLIENTE ===
    { title: 'Historia WA #1',
      description: 'Subir historia de WhatsApp con imagen de lista de precios o pegar alguna lista de precios. Siempre contenido nuevo.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'daily', repeat_time: '12:30:00' },
    { title: 'Historia WA #2',
      description: 'Grabar y subir video de actividad del local o equipo a la venta. Siempre contenido nuevo.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'daily', repeat_time: '15:00:00' },
    { title: 'Historia WA #3',
      description: 'Subir historia de cierre del día. Contenido libre relacionado al negocio.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'daily', repeat_time: '18:00:00' },
    { title: 'Difusión 5 números',
      description: 'Enviar mensaje de difusión a 5 contactos nuevos ofreciendo ver la lista de precios.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'daily',
      is_random_time: 1, random_time_from: '12:00:00', random_time_to: '19:00:00' },
    { title: 'Mensaje gremio',
      description: 'Enviar mensaje a un número del gremio ofreciendo cambio de vidrio.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'daily',
      is_random_time: 1, random_time_from: '12:00:00', random_time_to: '19:00:00' },

    // === SEMANALES ATENCIÓN AL CLIENTE ===
    { title: 'Barrer AC',
      description: 'Barrer el espacio de atención al cliente. Pasar trapo si hay manchas.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'weekly', repeat_time: '10:30:00', repeat_day_of_week: D.MON },
    { title: 'Barrer entrada',
      description: 'Barrer, tirar agua y dejar la entrada limpia.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'weekly', repeat_time: '12:00:00', repeat_day_of_week: D.MON },
    { title: 'Revisar IG',
      description: 'Revisar mensajes de Instagram de los últimos días. A quienes pidieron lista de precios preguntarles si la vieron. A los que compraron pedirles reseña. A los que repararon pedirles reseña y pasarles la página.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '11:00:00', repeat_day_of_week: D.TUE },
    { title: 'Repisa A o B',
      description: 'Limpiar los estantes de una de las dos repisas. Semanas alternas: semana impar repisa A, semana par repisa B.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '16:00:00', repeat_day_of_week: D.TUE },
    { title: 'Limpiar vidrio',
      description: 'Limpiar el vidrio de atención al cliente de los dos lados.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'weekly', repeat_time: '10:30:00', repeat_day_of_week: D.WED },
    { title: 'Revisar WA',
      description: 'Revisar mensajes de WhatsApp de los últimos días. A quienes pidieron lista de precios preguntarles si la vieron. A los que compraron pedirles reseña. A los que repararon pedirles reseña y pasarles la página.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '11:00:00', repeat_day_of_week: D.WED },
    { title: 'Revisar IG',
      description: 'Revisar mensajes de Instagram de los últimos días. A quienes pidieron lista de precios preguntarles si la vieron. A los que compraron pedirles reseña. A los que repararon pedirles reseña y pasarles la página.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '11:00:00', repeat_day_of_week: D.THU },
    { title: 'Revisar WA',
      description: 'Revisar mensajes de WhatsApp de los últimos días. A quienes pidieron lista de precios preguntarles si la vieron. A los que compraron pedirles reseña. A los que repararon pedirles reseña y pasarles la página.',
      group: ATENCION_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '11:00:00', repeat_day_of_week: D.FRI },

    // === BIWEEKLY ===
    { title: 'Baño', description: 'Pasar el trapo al piso del baño y limpiar el inodoro y el bidet.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'biweekly', repeat_time: '17:00:00', repeat_day_of_week: D.WED, offsetDays: 0 },
    { title: 'Baño', description: 'Pasar el trapo al piso del baño y limpiar el inodoro.',
      group: LAB_GROUP, can_postpone: 0,
      repeat_type: 'biweekly', repeat_time: '17:00:00', repeat_day_of_week: D.WED, offsetDays: 7 },
    { title: 'Basura AC', description: 'Vaciar el tacho de basura de atención al cliente.',
      group: ATENCION_GROUP, can_postpone: 0,
      repeat_type: 'biweekly', repeat_time: '19:00:00', repeat_day_of_week: D.THU, offsetDays: 0 },
    { title: 'Basura labs', description: 'Vaciar el tacho de basura de ambos laboratorios.',
      group: LAB_GROUP, can_postpone: 0,
      repeat_type: 'biweekly', repeat_time: '17:30:00', repeat_day_of_week: D.THU, offsetDays: 0 },

    // === SEMANALES LABORATORIO ===
    { title: 'Ordenar escritorio', description: 'Ordenar y aspirar el escritorio del laboratorio.',
      group: LAB_GROUP, can_postpone: 0,
      repeat_type: 'weekly', repeat_time: '10:30:00', repeat_day_of_week: D.MON },
    { title: 'Fotos faltantes',
      description: 'Revisar qué artículos de la página web no tienen foto y registrarlos para completar.',
      group: LAB_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '15:00:00', repeat_day_of_week: D.MON },
    { title: 'Blog', description: 'Subir una noticia nueva al blog del sitio web.',
      group: LAB_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '16:00:00', repeat_day_of_week: D.MON },
    { title: 'Barrer laboratorios + stock', description: 'Barrer los dos laboratorios y el salón de stock.',
      group: LAB_GROUP, can_postpone: 0,
      repeat_type: 'weekly', repeat_time: '10:30:00', repeat_day_of_week: D.WED },
    { title: 'Blog', description: 'Subir una noticia nueva al blog del sitio web.',
      group: LAB_GROUP, can_postpone: 1,
      repeat_type: 'weekly', repeat_time: '16:00:00', repeat_day_of_week: D.THU },
];

function toMysqlDt(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado. Modo: ${EXECUTE ? '🔴 EXECUTE' : '🟢 DRY-RUN'}\n`);

    try {
        const [[admin]] = await c.query(
            `SELECT idusers, username FROM users
             WHERE grupos_id = ? AND deleted_at IS NULL AND enabled = 1
             ORDER BY idusers LIMIT 1`,
            [ADMIN_GROUP]
        );
        if (!admin) throw new Error(`No hay usuario activo en grupo ${ADMIN_GROUP} (Admin)`);
        console.log(`created_by = ${admin.idusers} (${admin.username})\n`);

        const nowAR = new Date();
        let toInsert = 0, skipped = 0;
        const insertStatements = [];

        for (const t of TASKS) {
            // starts_at — para tareas biweekly con offsetDays, lo corremos
            // para alternar las semanas entre AC y Lab.
            const starts = new Date(nowAR);
            if (t.offsetDays) starts.setDate(starts.getDate() + t.offsetDays);
            const startsMysql = toMysqlDt(starts);

            // Idempotencia: skip si ya existe título + group + day_of_week
            // + repeat_time + repeat_type — combinación única funcional.
            const [existing] = await c.query(
                `SELECT id FROM tasks
                 WHERE deleted_at IS NULL
                   AND title = ?
                   AND assigned_to_group_id <=> ?
                   AND repeat_type = ?
                   AND repeat_time <=> ?
                   AND repeat_day_of_week <=> ?`,
                [t.title, t.group, t.repeat_type, t.repeat_time ?? null, t.repeat_day_of_week ?? null]
            );
            if (existing.length > 0) {
                skipped++;
                console.log(`  [skip] '${t.title}' (grupo ${t.group}, ${t.repeat_type}${t.repeat_day_of_week != null ? ' dow=' + t.repeat_day_of_week : ''}) — ya existe id=${existing[0].id}`);
                continue;
            }

            toInsert++;
            const args = [
                t.title, t.description, t.group, null /* user */,
                0 /* for_each_user */, t.can_postpone ?? 1,
                t.repeat_type, t.repeat_time ?? null,
                t.repeat_day_of_week ?? null, null /* day_of_month */,
                t.is_random_time ? 1 : 0, t.random_time_from ?? null, t.random_time_to ?? null,
                startsMysql, admin.idusers,
            ];
            insertStatements.push(args);
            console.log(`  [new ] '${t.title}' (grupo ${t.group}, ${t.repeat_type}${t.repeat_day_of_week != null ? ' dow=' + t.repeat_day_of_week : ''}${t.is_random_time ? ' RND' : (t.repeat_time ? ' @' + t.repeat_time : '')})`);
        }

        console.log(`\nResumen: ${toInsert} a insertar, ${skipped} ya existen`);

        if (EXECUTE && toInsert > 0) {
            await c.beginTransaction();
            try {
                const qIns = `INSERT INTO tasks
                  (title, description, assigned_to_group_id, assigned_to_user_id,
                   for_each_user, can_postpone, repeat_type, repeat_time,
                   repeat_day_of_week, repeat_day_of_month,
                   is_random_time, random_time_from, random_time_to,
                   starts_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                for (const args of insertStatements) {
                    await c.execute(qIns, args);
                }
                await c.commit();
                console.log(`\n✅ COMMIT — ${insertStatements.length} tareas insertadas.`);
            } catch (err) {
                await c.rollback();
                throw err;
            }
        } else if (!EXECUTE) {
            console.log(`\n🟢 DRY-RUN — nada se insertó. Pasá --execute para commitear.`);
        }
    } finally {
        await c.end();
    }
})().catch(e => { console.error('FATAL:', e.message); process.exitCode = 1; });
