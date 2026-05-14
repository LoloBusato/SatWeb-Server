// Read-only: lista el catálogo de states y cuenta órdenes activas por estado.
// Lo necesitamos para resolver el conflicto del UPDATE "COMPRAR REPUESTOO" →
// "COMPRAR REPUESTO" cuando ambos nombres ya existen.

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

    const [rows] = await conn.query(`
      SELECT s.idstates, s.state, s.color, s.deleted_at, s.forces_admin_assignment,
             COUNT(o.order_id) AS orders_count
      FROM states s
      LEFT JOIN orders o ON o.state_id = s.idstates
      WHERE s.state LIKE 'COMPRAR%' OR s.state LIKE 'ESPERANDO REPUESTO'
         OR s.state = 'CERRAR Y DEVOLVER'
      GROUP BY s.idstates, s.state, s.color, s.deleted_at, s.forces_admin_assignment
      ORDER BY s.idstates
    `);
    console.log('Estados relevantes:');
    console.table(rows);

    const [all] = await conn.query(
      'SELECT idstates, state, color, deleted_at, forces_admin_assignment FROM states ORDER BY idstates'
    );
    console.log('\nCatálogo completo:');
    console.table(all);

    await conn.end();
})();
