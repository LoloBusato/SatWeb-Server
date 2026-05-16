// Read-only: dimensiona la DB para evaluar migración a plan gratuito.
// Corre 3 queries:
//   1. Tamaño total (data + índices) de la DB
//   2. Desglose por tabla, ordenado desc
//   3. Conexiones activas al momento del run

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
        const [totalRows] = await conn.query(`
            SELECT
              table_schema AS db,
              ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb,
              ROUND(SUM(data_length) / 1024 / 1024, 2)               AS data_mb,
              ROUND(SUM(index_length) / 1024 / 1024, 2)              AS index_mb
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
            GROUP BY table_schema
        `);
        console.log('1) Tamaño total:');
        console.table(totalRows);

        const [tableRows] = await conn.query(`
            SELECT
              table_name AS tabla,
              ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb,
              ROUND(data_length / 1024 / 1024, 2)                  AS data_mb,
              ROUND(index_length / 1024 / 1024, 2)                 AS index_mb,
              table_rows                                           AS rows_aprox
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
            ORDER BY (data_length + index_length) DESC
        `);
        console.log('\n2) Desglose por tabla:');
        console.table(tableRows);

        const [connRows] = await conn.query("SHOW STATUS LIKE 'Threads_connected'");
        const [maxConnRows] = await conn.query("SHOW VARIABLES LIKE 'max_connections'");
        console.log('\n3) Conexiones:');
        console.table([
            { metric: 'Threads_connected (ahora)', value: connRows[0].Value },
            { metric: 'max_connections (límite)', value: maxConnRows[0].Value },
        ]);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
