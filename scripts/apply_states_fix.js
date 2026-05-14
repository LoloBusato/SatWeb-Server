// Aplica las correcciones del catálogo de estados pedidas en la planificación
// del home de Atención al Cliente (mayo 2026). Inspección previa
// (scripts/inspect_states.js) reveló que:
//   - id=12 'COMPRAR REPUESTO' ya existe pero está soft-deleted (0 órdenes).
//   - id=27 'COMPRAR REPUESTOO' es el typo activo (0 órdenes).
//   - id=8  'ESPERANDO REPUESTO' ya existe pero está soft-deleted (0 órdenes).
//   - 'CERRAR Y DEVOLVER' no existe.
// Por eso no se puede hacer un UPDATE de rename (rompe el UNIQUE incluso con
// soft-deletes) ni INSERT...NOT EXISTS para los reactivados.
//
// Plan en una sola transacción (rollback automático si algo falla):
//   1. DELETE id=27 (typo, sin órdenes).
//   2. UPDATE id=12 deleted_at = NULL (reactivar COMPRAR REPUESTO).
//   3. UPDATE id=8  deleted_at = NULL (reactivar ESPERANDO REPUESTO).
//   4. INSERT 'CERRAR Y DEVOLVER' si no existe.
//
// Uso:
//   node scripts/apply_states_fix.js
// Credenciales de .env.local (las mismas que database/dbConfig.js).

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const STATEMENTS = [
    {
        label: "1) DELETE 'COMPRAR REPUESTOO' (typo, id=27)",
        sql: "DELETE FROM states WHERE idstates = 27 AND state = 'COMPRAR REPUESTOO'",
    },
    {
        label: "2) Reactivar 'COMPRAR REPUESTO' (id=12)",
        sql: "UPDATE states SET deleted_at = NULL WHERE idstates = 12 AND state = 'COMPRAR REPUESTO'",
    },
    {
        label: "3) Reactivar 'ESPERANDO REPUESTO' (id=8)",
        sql: "UPDATE states SET deleted_at = NULL WHERE idstates = 8 AND state = 'ESPERANDO REPUESTO'",
    },
    {
        label: "4) INSERT 'CERRAR Y DEVOLVER' (si no existe)",
        sql: `INSERT INTO states (state, color)
              SELECT 'CERRAR Y DEVOLVER', 'rojo'
              WHERE NOT EXISTS (SELECT 1 FROM states WHERE state = 'CERRAR Y DEVOLVER')`,
    },
];

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
        multipleStatements: false,
    });
    console.log(`Conectado a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DBNAME}\n`);

    try {
        await conn.beginTransaction();

        for (const { label, sql } of STATEMENTS) {
            const [result] = await conn.execute(sql);
            console.log(`${label}`);
            console.log(`   affectedRows=${result.affectedRows}` +
                (result.insertId ? `  insertId=${result.insertId}` : ''));
        }

        await conn.commit();
        console.log('\nTransacción commit OK.\n');

        const [rows] = await conn.query(
            'SELECT idstates, state, color, deleted_at, forces_admin_assignment FROM states ORDER BY idstates'
        );
        console.log('SELECT * FROM states:');
        console.table(rows);
    } catch (err) {
        await conn.rollback();
        console.error('Error — se hizo rollback. Detalle:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
