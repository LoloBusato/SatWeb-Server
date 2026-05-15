// Aplica migration 0024_orders_users_id_nullable.sql: hace nullable la
// columna orders.users_id. Idempotente — verifica IS_NULLABLE antes del
// ALTER.

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
        const [[col]] = await conn.query(
            "SELECT IS_NULLABLE FROM information_schema.columns " +
            "WHERE table_schema = ? AND table_name = 'orders' AND column_name = 'users_id'",
            [process.env.DB_DBNAME]
        );
        if (col.IS_NULLABLE === 'YES') {
            console.log("users_id ya es NULL — skipping ALTER");
        } else {
            console.log("ALTER orders.users_id → NULL");
            await conn.query("ALTER TABLE orders MODIFY COLUMN users_id INT NULL");
            console.log("   OK");
        }

        const [[counts]] = await conn.query(
            "SELECT COUNT(*) AS total, SUM(users_id IS NULL) AS sin_asignar FROM orders"
        );
        console.log("\nResumen:");
        console.table([counts]);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
