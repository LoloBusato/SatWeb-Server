// Crea la tabla saved_texts (clave-valor para textos persistentes consumidos
// desde el frontend estático /lista-precios.html) y siembra 'nuestros-usados'
// con content vacío. Idempotente.

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
        console.log('1) CREATE TABLE IF NOT EXISTS saved_texts');
        await conn.query(`
            CREATE TABLE IF NOT EXISTS saved_texts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                slug VARCHAR(100) NOT NULL UNIQUE,
                content LONGTEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('   OK');

        console.log("2) INSERT 'nuestros-usados' (si no existe)");
        const [r] = await conn.query(`
            INSERT INTO saved_texts (slug, content)
            SELECT 'nuestros-usados', ''
            WHERE NOT EXISTS (SELECT 1 FROM saved_texts WHERE slug = 'nuestros-usados')
        `);
        console.log(`   affectedRows=${r.affectedRows}` + (r.insertId ? `  insertId=${r.insertId}` : ''));

        const [rows] = await conn.query('SELECT id, slug, LENGTH(content) AS content_len, updated_at FROM saved_texts');
        console.log('\nContenido de saved_texts:');
        console.table(rows);
    } catch (err) {
        console.error('Error:', err.message);
        process.exitCode = 1;
    } finally {
        await conn.end();
    }
})();
