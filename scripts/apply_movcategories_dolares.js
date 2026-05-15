// Inserta categorías "Dólares Banco" y "Cripto" en movcategories (tipo
// Cuentas, es_dolar=1), idempotente vía WHERE NOT EXISTS.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

const STATEMENTS = [
    {
        label: "1) INSERT 'Dólares Banco' (si no existe)",
        sql: `INSERT INTO movcategories (categories, tipo, branch_id, es_dolar)
              SELECT 'Dólares Banco', 'Cuentas', NULL, 1
              WHERE NOT EXISTS (SELECT 1 FROM movcategories WHERE categories = 'Dólares Banco')`,
    },
    {
        label: "2) INSERT 'Cripto' (si no existe)",
        sql: `INSERT INTO movcategories (categories, tipo, branch_id, es_dolar)
              SELECT 'Cripto', 'Cuentas', NULL, 1
              WHERE NOT EXISTS (SELECT 1 FROM movcategories WHERE categories = 'Cripto')`,
    },
];

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
            "SELECT * FROM movcategories WHERE tipo = 'Cuentas' ORDER BY idmovcategories"
        );
        console.log("SELECT * FROM movcategories WHERE tipo = 'Cuentas':");
        console.table(rows);
    } catch (err) {
        await conn.rollback();
        console.error('Error — rollback. Detalle:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
