// Fase 3.4 — replica del patrón PoC a las 3 columnas restantes:
//   orders.created_at_dt, orders.returned_at_dt, reducestock.date_dt.

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

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

describe('Fase 3.4 — orders.created_at_dt', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('columna es DATETIME NOT NULL con DEFAULT CURRENT_TIMESTAMP', async () => {
    const row = await queryOne<{
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>(
      `SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'created_at_dt'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('NO');
    expect(row!.COLUMN_DEFAULT).toBe('CURRENT_TIMESTAMP');
  });

  it('backfill: todas las filas preexistentes tienen DATETIME consistente con VARCHAR', async () => {
    const row = await queryOne<{ total: number; mismatches: number }>(
      `SELECT COUNT(*) AS total,
              SUM(DATE(created_at_dt) <> STR_TO_DATE(created_at, '%d/%m/%Y')) AS mismatches
       FROM orders`,
    );
    expect(Number(row!.total)).toBeGreaterThan(0);
    expect(Number(row!.mismatches)).toBe(0);
  });

  it('trigger BEFORE INSERT existe', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.TRIGGERS
       WHERE EVENT_OBJECT_SCHEMA = DATABASE() AND TRIGGER_NAME = 'orders_dates_before_insert'`,
    );
    expect(Number(row!.cnt)).toBe(1);
  });
});

describe('Fase 3.4 — orders.returned_at_dt', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('columna es DATETIME NULL sin default (nullable genuina)', async () => {
    const row = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'returned_at_dt'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('YES');
  });

  it('backfill: NULLs preservados, valores consistentes', async () => {
    const row = await queryOne<{
      total: number;
      both_null: number;
      both_set: number;
      mismatches: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(returned_at IS NULL AND returned_at_dt IS NULL) AS both_null,
         SUM(returned_at IS NOT NULL AND returned_at_dt IS NOT NULL) AS both_set,
         SUM(returned_at IS NOT NULL
             AND DATE(returned_at_dt) <> STR_TO_DATE(returned_at, '%d/%m/%Y')) AS mismatches
       FROM orders`,
    );
    expect(Number(row!.both_null) + Number(row!.both_set)).toBe(Number(row!.total));
    expect(Number(row!.mismatches)).toBe(0);
  });

  it('trigger BEFORE UPDATE propaga cuando v2 marca orden como entregada', async () => {
    const app = createApp();
    const pruebaPw = await getRawPassword('prueba');
    const pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const order = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders
       WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    const entregado = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states WHERE marks_as_delivered = 1 LIMIT 1`,
    );

    const res = await request(app)
      .patch(`/api/v2/orders/${order!.id}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: entregado!.id });
    expect(res.status).toBe(200);

    const row = await queryOne<{ returned_at: string; returned_at_dt: string }>(
      `SELECT returned_at,
              DATE_FORMAT(returned_at_dt, '%Y-%m-%d') AS returned_at_dt
       FROM orders WHERE order_id = ?`,
      [order!.id],
    );
    expect(row!.returned_at).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
    // DATETIME debería ser el mismo día (hora 00:00:00)
    const parts = row!.returned_at.split('/');
    const expectedIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    expect(row!.returned_at_dt).toBe(expectedIso);
  });

  it('UPDATE que no toca returned_at NO sobreescribe returned_at_dt', async () => {
    // Encontrar una orden con returned_at ya seteada.
    const target = await queryOne<{
      id: number;
      returned_at: string;
      returned_at_dt: string;
    }>(
      `SELECT order_id AS id, returned_at,
              DATE_FORMAT(returned_at_dt, '%Y-%m-%d %H:%i:%s') AS returned_at_dt
       FROM orders WHERE returned_at IS NOT NULL LIMIT 1`,
    );

    // UPDATE que sólo cambia state_id. El trigger debe ver returned_at <=> OLD.returned_at
    // y dejar returned_at_dt intacta.
    await withConn(async (conn) => {
      await conn.query(`UPDATE orders SET state_id = state_id WHERE order_id = ?`, [target!.id]);
    });

    const after = await queryOne<{ returned_at_dt: string }>(
      `SELECT DATE_FORMAT(returned_at_dt, '%Y-%m-%d %H:%i:%s') AS returned_at_dt
       FROM orders WHERE order_id = ?`,
      [target!.id],
    );
    expect(after!.returned_at_dt).toBe(target!.returned_at_dt);
  });

  it('UPDATE que setea returned_at = NULL también limpia returned_at_dt', async () => {
    const target = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE returned_at IS NOT NULL LIMIT 1`,
    );
    await withConn(async (conn) => {
      await conn.query(
        `UPDATE orders SET returned_at = NULL WHERE order_id = ?`,
        [target!.id],
      );
    });

    const row = await queryOne<{ returned_at: string | null; returned_at_dt: string | null }>(
      `SELECT returned_at, returned_at_dt FROM orders WHERE order_id = ?`,
      [target!.id],
    );
    expect(row!.returned_at).toBeNull();
    expect(row!.returned_at_dt).toBeNull();
  });
});

describe('Fase 3.4 — reducestock.date_dt', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('columna es DATETIME NOT NULL con DEFAULT CURRENT_TIMESTAMP', async () => {
    const row = await queryOne<{
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
    }>(
      `SELECT DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reducestock' AND COLUMN_NAME = 'date_dt'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('NO');
    expect(row!.COLUMN_DEFAULT).toBe('CURRENT_TIMESTAMP');
  });

  it('backfill: todas las filas preexistentes tienen date_dt consistente con VARCHAR', async () => {
    const row = await queryOne<{ total: number; mismatches: number }>(
      `SELECT COUNT(*) AS total,
              SUM(STR_TO_DATE(\`date\`, '%d/%m/%Y %H:%i:%s') <> date_dt) AS mismatches
       FROM reducestock`,
    );
    expect(Number(row!.total)).toBeGreaterThan(0);
    expect(Number(row!.mismatches)).toBe(0);
  });

  it('legacy-shape INSERT fillea date_dt via trigger', async () => {
    const order = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders ORDER BY order_id DESC LIMIT 1`,
    );
    const user = await queryOne<{ id: number }>(
      `SELECT idusers AS id FROM users WHERE deleted_at IS NULL LIMIT 1`,
    );
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO reducestock (orderid, userid, \`date\`) VALUES (?, ?, '7/3/2025 9:05:33')`,
        [order!.id, user!.id],
      );
    });

    const row = await queryOne<{ date: string; date_dt: string }>(
      `SELECT \`date\`, DATE_FORMAT(date_dt, '%Y-%m-%d %H:%i:%s') AS date_dt
       FROM reducestock WHERE \`date\` = '7/3/2025 9:05:33' LIMIT 1`,
    );
    expect(row!.date_dt).toBe('2025-03-07 09:05:33');
  });

  it('INSERT con date VARCHAR inválido → trigger fallback a DEFAULT CURRENT_TIMESTAMP', async () => {
    const order = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders ORDER BY order_id DESC LIMIT 1`,
    );
    const user = await queryOne<{ id: number }>(
      `SELECT idusers AS id FROM users WHERE deleted_at IS NULL LIMIT 1`,
    );
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO reducestock (orderid, userid, \`date\`) VALUES (?, ?, 'garbage')`,
        [order!.id, user!.id],
      );
    });

    const row = await queryOne<{ seconds_since: number }>(
      `SELECT TIMESTAMPDIFF(SECOND, date_dt, NOW()) AS seconds_since
       FROM reducestock WHERE \`date\` = 'garbage' LIMIT 1`,
    );
    expect(Math.abs(Number(row!.seconds_since))).toBeLessThan(60);
  });
});
