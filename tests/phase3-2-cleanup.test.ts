// Fase 3.2 — verifica el cleanup + FKs + drop de columna muerta.

import { beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { queryOne, resetTestDb } from './helpers/db';

async function expectFkError(run: () => Promise<unknown>): Promise<void> {
  let thrown: unknown = null;
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).not.toBeNull();
  const msg = String((thrown as { message?: string } | null)?.message ?? '');
  expect(msg).toMatch(/foreign key|1452|constraint/i);
}

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

describe('Fase 3.2 — orders.order_primary_id dropped', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('la columna order_primary_id no existe más', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'order_primary_id'`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });
});

describe('Fase 3.2 — stock cleanup + FK stock.repuesto_id', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('los 7 stock items huérfanos fueron borrados', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM stock WHERE idstock IN (361, 436, 1057, 1324, 1339, 1340, 1534)`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('stockbranch de los 7 items también desapareció (ON DELETE CASCADE)', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM stockbranch
       WHERE stock_id IN (361, 436, 1057, 1324, 1339, 1340, 1534)`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('las 3 garantías del stock 1057 fueron borradas', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM garantia WHERE stock_id = 1057`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('no quedan stock.repuesto_id huérfanos', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM stock s
       LEFT JOIN repuestos r ON s.repuesto_id = r.idrepuestos
       WHERE r.idrepuestos IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('FK stock.repuesto_id rechaza repuesto_id inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo)
           SELECT 999999, 1, 0.00, p.idproveedores, CURDATE(), 'fk-test-repuesto'
           FROM proveedores p LIMIT 1`,
        );
      }),
    );
  });
});

describe('Fase 3.2 — messages.orderId nullable + FK ON DELETE SET NULL', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('messages.orderId ahora es nullable', async () => {
    const row = await queryOne<{ IS_NULLABLE: string }>(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'orderId'`,
    );
    expect(row!.IS_NULLABLE).toBe('YES');
  });

  it('no quedan messages huérfanos (orphans → NULL)', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM messages m
       LEFT JOIN orders o ON o.order_id = m.orderId
       WHERE m.orderId IS NOT NULL AND o.order_id IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('los mensajes antes huérfanos ahora tienen orderId = NULL (preserva audit)', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM messages
       WHERE idmessages IN (3908, 3909, 3910, 3911, 3912, 3913, 10822)
         AND orderId IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(7);
  });

  it('FK rechaza orderId inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO messages (message, username, created_at, orderId)
           VALUES ('test fk', 'tester', NOW(), 999999)`,
        );
      }),
    );
  });

  it('acepta orderId NULL (inbox auditoría post-delete de orden)', async () => {
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO messages (message, username, created_at, orderId)
         VALUES ('auditoría post-delete', 'tester', NOW(), NULL)`,
      );
    });
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM messages WHERE message = 'auditoría post-delete' AND orderId IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(1);
  });
});

describe('Fase 3.2 — reducestock FKs con ON DELETE SET NULL', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('no quedan reducestock.stockid huérfanos', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM reducestock rs
       LEFT JOIN stock s ON s.idstock = rs.stockid
       WHERE rs.stockid IS NOT NULL AND s.idstock IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('no quedan reducestock.stockbranch_id huérfanos', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM reducestock rs
       LEFT JOIN stockbranch sb ON sb.stockbranchid = rs.stockbranch_id
       WHERE rs.stockbranch_id IS NOT NULL AND sb.stockbranchid IS NULL`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('FK reducestock.stockid rechaza stockid inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO reducestock (orderid, userid, stockid, date)
           SELECT o.order_id, u.idusers, 999999, NOW()
           FROM orders o, users u WHERE u.deleted_at IS NULL LIMIT 1`,
        );
      }),
    );
  });

  it('FK reducestock.stockbranch_id rechaza stockbranch_id inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO reducestock (orderid, userid, stockbranch_id, date)
           SELECT o.order_id, u.idusers, 999999, NOW()
           FROM orders o, users u WHERE u.deleted_at IS NULL LIMIT 1`,
        );
      }),
    );
  });
});
