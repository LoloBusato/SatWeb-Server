// Migration: agregar columnas para el flujo de Pre-Venta + categoría "Seña".
// Una pre-venta es una orden con es_preventa=1 que arranca con un depósito
// (seña) y se completa cuando el cliente retira el equipo. Es_dolar = 0
// porque las señas suelen ser en pesos.

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

    async function columnExists(table, col) {
        const [rows] = await conn.query(
            `SELECT COUNT(*) AS n FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
            [process.env.DB_DBNAME, table, col]
        );
        return rows[0].n > 0;
    }

    try {
        for (const [col, def] of [
            ['es_preventa', 'TINYINT(1) NOT NULL DEFAULT 0'],
            ['precio_venta', 'DECIMAL(10,2) NULL'],
            ['color_preventa', 'VARCHAR(100) NULL'],
        ]) {
            if (await columnExists('orders', col)) {
                console.log(`orders.${col} ya existe — skip`);
            } else {
                console.log(`ALTER orders ADD COLUMN ${col} ${def}`);
                await conn.query(`ALTER TABLE orders ADD COLUMN \`${col}\` ${def}`);
                console.log('  OK');
            }
        }

        console.log("\nINSERT 'Seña' en movcategories (si no existe)");
        const [r] = await conn.query(`
            INSERT INTO movcategories (categories, tipo, branch_id, es_dolar)
            SELECT 'Seña', 'Señas', NULL, 0
            WHERE NOT EXISTS (SELECT 1 FROM movcategories WHERE categories = 'Seña')
        `);
        console.log(`  affectedRows=${r.affectedRows}` + (r.insertId ? `  insertId=${r.insertId}` : ''));

        const [verify] = await conn.query(
            `SELECT idmovcategories, categories, tipo, branch_id, es_dolar
             FROM movcategories WHERE categories = 'Seña'`
        );
        console.log('\nSeña:');
        console.table(verify);

        const [orderCols] = await conn.query(
            `SELECT column_name, data_type, is_nullable, column_default
             FROM information_schema.columns
             WHERE table_schema = ? AND table_name = 'orders'
               AND column_name IN ('es_preventa','precio_venta','color_preventa')`,
            [process.env.DB_DBNAME]
        );
        console.log('\norders nuevas columnas:');
        console.table(orderCols);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
