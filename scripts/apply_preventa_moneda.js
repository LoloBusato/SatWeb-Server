// Migration: agrega moneda_preventa a orders. Default 'USD' (cumple el
// spec del owner — el precio default de pre-ventas es USD).
// Backfill: pre-ventas existentes creadas ANTES de este cambio venían con
// precio_venta en pesos (el form pedía pesos), así que las marcamos 'ARS'
// para preservar su semántica.

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
        const [exists] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.columns
             WHERE table_schema = ? AND table_name = 'orders' AND column_name = 'moneda_preventa'`,
            [process.env.DB_DBNAME]
        );
        if (exists[0].n > 0) {
            console.log("orders.moneda_preventa ya existe — skip ALTER");
        } else {
            console.log("ALTER orders ADD COLUMN moneda_preventa VARCHAR(3) DEFAULT 'USD'");
            await conn.query(
                "ALTER TABLE orders ADD COLUMN moneda_preventa VARCHAR(3) DEFAULT 'USD'"
            );
            console.log("  OK");
        }

        console.log("\nBackfill: pre-ventas previas (es_preventa=1) → moneda='ARS'");
        const [bf] = await conn.query(
            "UPDATE orders SET moneda_preventa = 'ARS' WHERE es_preventa = 1 AND moneda_preventa IS NULL"
        );
        console.log(`  affectedRows=${bf.affectedRows}`);

        const [verify] = await conn.query(`
            SELECT moneda_preventa, COUNT(*) AS n
            FROM orders WHERE es_preventa = 1
            GROUP BY moneda_preventa
        `);
        console.log('\nDistribución actual pre-ventas:');
        console.table(verify);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
