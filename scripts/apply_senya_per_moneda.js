// Migration: split 'Seña' en 'Seña USD' (es_dolar=1) y 'Seña ARS' (es_dolar=0).
// Antes una sola categoría 'Seña' (es_dolar=0) acumulaba todo en pesos, con
// conversión vía dolar blue del momento → drift entre señado y cobro al
// retiro. Después de este cambio cada moneda se acumula en su propia
// categoría sin conversión, preservando precisión.

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
        // Step 1: rename 'Seña' → 'Seña ARS' si existe.
        const [renamed] = await conn.query(
            "UPDATE movcategories SET categories = 'Seña ARS' WHERE categories = 'Seña'"
        );
        console.log(`1) Rename 'Seña' → 'Seña ARS': affectedRows=${renamed.affectedRows}`);

        // Step 2: insertar 'Seña USD' si no existe.
        const [inserted] = await conn.query(`
            INSERT INTO movcategories (categories, tipo, branch_id, es_dolar)
            SELECT 'Seña USD', 'Señas', NULL, 1
            WHERE NOT EXISTS (SELECT 1 FROM movcategories WHERE categories = 'Seña USD')
        `);
        console.log(`2) INSERT 'Seña USD': affectedRows=${inserted.affectedRows}` +
            (inserted.insertId ? `  insertId=${inserted.insertId}` : ''));

        // Step 3: fix etiquetas movname.ingreso/egreso que pudieran apuntar
        // al label viejo 'Seña' (JOIN en CRUD/movname.js GET es por nombre).
        const [bfEgreso] = await conn.query(
            "UPDATE movname SET egreso = 'Seña ARS' WHERE egreso = 'Seña'"
        );
        const [bfIngreso] = await conn.query(
            "UPDATE movname SET ingreso = 'Seña ARS' WHERE ingreso = 'Seña'"
        );
        console.log(`3) Backfill movname.egreso: ${bfEgreso.affectedRows}, movname.ingreso: ${bfIngreso.affectedRows}`);

        const [verify] = await conn.query(`
            SELECT idmovcategories, categories, tipo, es_dolar
            FROM movcategories WHERE categories LIKE 'Seña%' OR tipo = 'Señas'
            ORDER BY categories
        `);
        console.log('\nEstado actual de categorías Seña:');
        console.table(verify);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
