require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DBNAME,
  });
  const [bs] = await c.query(`
    SELECT bs.*, ds.state AS delivered_state_name, rs.state AS ready_state_name, is2.state AS incucai_state_name
    FROM branch_settings bs
    LEFT JOIN states ds ON ds.idstates = bs.delivered_state_id
    LEFT JOIN states rs ON rs.idstates = bs.ready_state_id
    LEFT JOIN states is2 ON is2.idstates = bs.incucai_state_id
  `);
  console.table(bs);
  const [u18] = await c.query("SELECT u.iduser, u.username, u.grupos_id, g.grupo FROM users u LEFT JOIN grupousuarios g ON g.idgrupousuarios = u.grupos_id WHERE u.iduser = 18 OR u.grupos_id = 18");
  console.log('users con id=18 o grupos_id=18 (referencia hardcoded en finalizar):');
  console.table(u18);
  await c.end();
})();
