// Migration: estado DEUDOR (amarillo) para pre-ventas con pago parcial.
// La orden cae acá cuando el cliente retira pagando menos del saldo;
// queda asignada a Atención y se cobra el resto vía PreVentaCobro.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });
    console.log(`Conectado a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DBNAME}\n`);
    try {
        const [r] = await c.query(`
            INSERT INTO states (state, color)
            SELECT 'DEUDOR', 'amarillo'
            WHERE NOT EXISTS (SELECT 1 FROM states WHERE state = 'DEUDOR')
        `);
        console.log(`INSERT 'DEUDOR': affectedRows=${r.affectedRows}` +
            (r.insertId ? `  insertId=${r.insertId}` : ''));
        const [verify] = await c.query(
            "SELECT idstates, state, color, deleted_at FROM states WHERE state = 'DEUDOR'"
        );
        console.table(verify);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await c.end();
    }
})();
