// Aplica la migration 0023_orders_state_changed_at.sql contra la DB.
// El paso 1 puede correrse solo una vez (ADD COLUMN falla si ya existe);
// el script chequea primero y skipea el ALTER si la columna está.
//
// Uso:
//   node scripts/apply_state_changed_at.js
// Credenciales de .env.local (las mismas que database/dbConfig.js).

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

(async () => {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DBNAME}\n`);

    try {
        const [existing] = await conn.query(
            "SHOW COLUMNS FROM orders LIKE 'state_changed_at'"
        );

        if (existing.length === 0) {
            console.log("1) ADD COLUMN state_changed_at");
            await conn.query(
                "ALTER TABLE orders ADD COLUMN state_changed_at DATETIME NULL AFTER returned_at"
            );
            console.log("   OK");
        } else {
            console.log("1) ADD COLUMN state_changed_at — ya existe, skipping");
        }

        console.log("2) Backfill state_changed_at = COALESCE(returned_at, created_at)");
        const [bf] = await conn.query(
            "UPDATE orders SET state_changed_at = COALESCE(returned_at, created_at) WHERE state_changed_at IS NULL"
        );
        console.log(`   affectedRows=${bf.affectedRows}`);

        const [counts] = await conn.query(`
            SELECT
              COUNT(*) AS total,
              COUNT(state_changed_at) AS con_state_changed_at,
              MIN(state_changed_at) AS min_state_changed_at,
              MAX(state_changed_at) AS max_state_changed_at
            FROM orders
        `);
        console.log("\nValidación:");
        console.table(counts);

        const [sample] = await conn.query(`
            SELECT order_id, state_id, created_at, returned_at, state_changed_at
            FROM orders
            ORDER BY order_id DESC
            LIMIT 5
        `);
        console.log("Muestra (últimas 5 órdenes):");
        console.table(sample);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
