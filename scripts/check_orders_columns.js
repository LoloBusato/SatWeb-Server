// Read-only: lista columnas reales de la tabla orders para confirmar si
// existen state_changed_at / updated_at antes de cambiar el frontend.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DBNAME,
  });
  const [cols] = await c.query("SHOW COLUMNS FROM orders");
  console.log(cols.map(r => `${r.Field}  ${r.Type}  null=${r.Null}  default=${r.Default}`).join('\n'));
  await c.end();
})();
