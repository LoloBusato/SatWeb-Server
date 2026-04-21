import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const ROOT_DIR = path.resolve(__dirname, '../..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'db');
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'db', 'migrations');

function dbConfig() {
  return {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
  };
}

function findLatestBackup(): string {
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => /^backup-.*\.sql$/.test(f))
    .map((f) => path.join(BACKUPS_DIR, f))
    .sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`No backup file in ${BACKUPS_DIR}. Run mysqldump first.`);
  return latest;
}

export async function resetTestDb(): Promise<void> {
  const dbName = process.env.DB_DBNAME!;
  const admin = await mysql.createConnection({
    ...dbConfig(),
    multipleStatements: true,
  });

  await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await admin.query(
    `CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  );
  await admin.query(`USE \`${dbName}\``);

  const backupSql = fs.readFileSync(findLatestBackup(), 'utf8');
  await admin.query(backupSql);

  await admin.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id VARCHAR(100) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await admin.query(sql);
    await admin.query('INSERT INTO _migrations (id) VALUES (?)', [file]);
  }

  await admin.end();
}

export async function getRawPassword(username: string): Promise<string | null> {
  const conn = await mysql.createConnection({
    ...dbConfig(),
    database: process.env.DB_DBNAME!,
  });
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    'SELECT password FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  await conn.end();
  return rows[0]?.password ?? null;
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const conn = await mysql.createConnection({
    ...dbConfig(),
    database: process.env.DB_DBNAME!,
  });
  const [rows] = await conn.query<mysql.RowDataPacket[]>(sql, params);
  await conn.end();
  return (rows[0] as T) ?? null;
}
