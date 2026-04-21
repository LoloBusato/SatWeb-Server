import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env';
import { logger } from '../src/config/logger';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DBNAME,
    multipleStatements: true,
  });

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id VARCHAR(100) NOT NULL,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT id FROM _migrations');
    const applied = new Set(rows.map((r) => String(r.id)));

    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      logger.info({ totalFiles: files.length }, 'no pending migrations');
      return;
    }

    logger.info({ pending, dryRun }, `${pending.length} pending migration(s)`);

    if (dryRun) {
      for (const file of pending) {
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        logger.info({ file, bytes: sql.length }, 'would apply');
      }
      return;
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      logger.info({ file }, 'applying');
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO _migrations (id) VALUES (?)', [file]);
        logger.info({ file }, 'applied');
      } catch (err) {
        logger.error({ file, err }, 'migration FAILED — stopping');
        throw err;
      }
    }

    logger.info({ applied: pending.length }, 'done');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  logger.error({ err }, 'migration runner crashed');
  process.exit(1);
});
