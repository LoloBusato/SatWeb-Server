// Read-only: lista cómo están distribuidas las órdenes activas entre los
// estados del flujo de Atención al Cliente y qué grupo las tiene asignadas.
// Necesario para entender si el filtro users_id === 14 está dejando
// órdenes afuera.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST, port: process.env.DB_PORT,
        user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
        database: process.env.DB_DBNAME,
    });

    const [rows] = await c.query(`
        SELECT s.state, g.grupo, COUNT(*) AS cant
        FROM orders o
        JOIN states s ON s.idstates = o.state_id
        LEFT JOIN grupousuarios g ON g.idgrupousuarios = o.users_id
        WHERE s.state IN (
            'REPARADO','PRESUPUESTAR','CONSULTAR A CLIENTE','COMPRAR REPUESTO',
            'NO REPARADO','ESPERANDO RESPUESTA CLIENTE','ESPERANDO REPUESTO',
            'REPARADO CLIENTE AVISADO','SOLUCIONA ADMIN'
        )
        GROUP BY s.state, g.grupo
        ORDER BY s.state, g.grupo
    `);
    console.log('Distribución por estado × grupo:');
    console.table(rows);

    const [total] = await c.query(`
        SELECT COUNT(*) AS total_activas FROM orders o
        JOIN states s ON s.idstates = o.state_id
        WHERE s.state NOT IN ('ENTREGADO','INCUCAI')
    `);
    console.log('Total activas (sin ENTREGADO/INCUCAI):', total[0].total_activas);

    const [grupos] = await c.query(`
        SELECT idgrupousuarios, grupo FROM grupousuarios
        WHERE deleted_at IS NULL
        ORDER BY idgrupousuarios
    `);
    console.log('\nGrupos activos:');
    console.table(grupos);

    await c.end();
})();
