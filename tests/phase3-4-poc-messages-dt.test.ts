// Fase 3.4 — PoC: messages.created_at_dt (DATETIME) con trigger dual-write
// desde messages.created_at (VARCHAR).

import { beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { queryOne, resetTestDb } from './helpers/db';

async function withConn<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

describe('Fase 3.4 — PoC messages.created_at_dt', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('columna created_at_dt es DATETIME NOT NULL con DEFAULT CURRENT_TIMESTAMP', async () => {
    const row = await queryOne<{
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>(
      `SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'created_at_dt'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('NO');
    expect(row!.COLUMN_DEFAULT).toBe('CURRENT_TIMESTAMP');
  });

  it('VARCHAR created_at sigue existiendo y no se tocó', async () => {
    const row = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'created_at'`,
    );
    expect(row!.DATA_TYPE).toBe('varchar');
    expect(row!.IS_NULLABLE).toBe('NO');
  });

  it('trigger messages_created_at_dual_write existe como BEFORE INSERT', async () => {
    const row = await queryOne<{ EVENT_MANIPULATION: string; ACTION_TIMING: string }>(
      `SELECT EVENT_MANIPULATION, ACTION_TIMING FROM information_schema.TRIGGERS
       WHERE EVENT_OBJECT_SCHEMA = DATABASE() AND TRIGGER_NAME = 'messages_created_at_dual_write'`,
    );
    expect(row!.EVENT_MANIPULATION).toBe('INSERT');
    expect(row!.ACTION_TIMING).toBe('BEFORE');
  });

  it('backfill: todas las filas preexistentes tienen created_at_dt consistente con el VARCHAR', async () => {
    const row = await queryOne<{ total: number; mismatches: number }>(
      `SELECT COUNT(*) AS total,
              SUM(STR_TO_DATE(created_at, '%d/%m/%Y %H:%i:%s') <> created_at_dt) AS mismatches
       FROM messages`,
    );
    expect(Number(row!.total)).toBeGreaterThan(0);
    expect(Number(row!.mismatches)).toBe(0);
  });

  it('legacy-shape INSERT (sólo VARCHAR) → trigger fillea DATETIME parseada', async () => {
    const orderRow = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders ORDER BY order_id DESC LIMIT 1`,
    );
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO messages (message, username, created_at, orderId)
         VALUES ('test PoC trigger', 'tester', '15/3/2025 10:30:45', ?)`,
        [orderRow!.id],
      );
    });

    const row = await queryOne<{ created_at: string; created_at_dt: string }>(
      `SELECT created_at,
              DATE_FORMAT(created_at_dt, '%Y-%m-%d %H:%i:%s') AS created_at_dt
       FROM messages WHERE message = 'test PoC trigger' LIMIT 1`,
    );
    expect(row!.created_at).toBe('15/3/2025 10:30:45');
    expect(row!.created_at_dt).toBe('2025-03-15 10:30:45');
  });

  it('INSERT con VARCHAR inválido → trigger fallback al DEFAULT CURRENT_TIMESTAMP', async () => {
    const orderRow = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders ORDER BY order_id DESC LIMIT 1`,
    );
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO messages (message, username, created_at, orderId)
         VALUES ('test trigger garbage', 'tester', 'not a valid date string', ?)`,
        [orderRow!.id],
      );
    });

    // DATETIME debería estar ~ahora porque el DEFAULT CURRENT_TIMESTAMP queda
    // en NEW.created_at_dt antes del trigger y el IFNULL lo preserva cuando
    // STR_TO_DATE devuelve NULL.
    const row = await queryOne<{ seconds_since: number }>(
      `SELECT TIMESTAMPDIFF(SECOND, created_at_dt, NOW()) AS seconds_since
       FROM messages WHERE message = 'test trigger garbage' LIMIT 1`,
    );
    expect(Math.abs(Number(row!.seconds_since))).toBeLessThan(60);
  });

  it('sorting por created_at_dt funciona (semánticamente correcto, antes requería STR_TO_DATE)', async () => {
    const orderRow = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders ORDER BY order_id DESC LIMIT 1`,
    );
    await withConn(async (conn) => {
      // Insertamos 3 mensajes con fechas de prueba fuera de orden cronológico.
      await conn.query(
        `INSERT INTO messages (message, username, created_at, orderId) VALUES
           ('sort-c', 'tester', '10/1/2020 10:00:00', ?),
           ('sort-a', 'tester', '1/1/2020 9:00:00', ?),
           ('sort-b', 'tester', '5/1/2020 9:30:00', ?)`,
        [orderRow!.id, orderRow!.id, orderRow!.id],
      );
    });

    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT!),
      user: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_DBNAME!,
    });
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT message FROM messages WHERE message IN ('sort-a', 'sort-b', 'sort-c')
       ORDER BY created_at_dt ASC`,
    );
    await conn.end();
    const messages = rows.map((r) => r.message);
    expect(messages).toEqual(['sort-a', 'sort-b', 'sort-c']);
  });
});
