import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

const CRON_SECRET = process.env.CRON_SECRET!;

async function setOrderState(orderId: number, stateId: number): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  await conn.query(`UPDATE orders SET state_id = ?, returned_at = NULL WHERE order_id = ?`, [
    stateId,
    orderId,
  ]);
  await conn.end();
}

async function setHistoryDaysAgo(
  orderId: number,
  toStateId: number,
  daysAgo: number,
): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  await conn.query(
    `INSERT INTO order_state_history (order_id, from_state_id, to_state_id, changed_by, changed_at, note)
     VALUES (?, NULL, ?, (SELECT idusers FROM users WHERE username='system' LIMIT 1),
             NOW() - INTERVAL ? DAY, 'backdate for cron test')`,
    [orderId, toStateId, daysAgo],
  );
  await conn.end();
}

describe('GET /api/v2/internal/archive-overdue-tick', () => {
  const app = createApp();
  let pruebaToken = '';
  let readyStateId = 0;
  let incucaiStateId = 0;
  let overdueOrderId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const twoStates = await queryOne<{ ready: number; incucai: number }>(
      `SELECT
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1) AS ready,
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1 OFFSET 1) AS incucai`,
    );
    readyStateId = twoStates!.ready;
    incucaiStateId = twoStates!.incucai;

    await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId });

    const orderRow = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    overdueOrderId = orderRow!.id;
    await setOrderState(overdueOrderId, readyStateId);
    await setHistoryDaysAgo(overdueOrderId, readyStateId, 200); // > 180d default
  });

  it('rejects missing Bearer header with 401', async () => {
    const res = await request(app).get('/api/v2/internal/archive-overdue-tick');
    expect(res.status).toBe(401);
  });

  it('rejects wrong Bearer token with 401', async () => {
    const res = await request(app)
      .get('/api/v2/internal/archive-overdue-tick')
      .set('Authorization', 'Bearer something-else-entirely');
    expect(res.status).toBe(401);
  });

  it('does NOT accept JWT tokens — auth is only via CRON_SECRET', async () => {
    const res = await request(app)
      .get('/api/v2/internal/archive-overdue-tick')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(401);
  });

  it('with valid CRON_SECRET archives overdue orders + attributes to system user', async () => {
    const res = await request(app)
      .get('/api/v2/internal/archive-overdue-tick')
      .set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.archived).toBeGreaterThanOrEqual(1);
    expect(res.body.orderIds).toContain(overdueOrderId);

    // La orden ahora está en incucaiState
    const orderAfter = await queryOne<{ state_id: number }>(
      `SELECT state_id FROM orders WHERE order_id = ?`,
      [overdueOrderId],
    );
    expect(orderAfter!.state_id).toBe(incucaiStateId);

    // Historia registrada con changed_by = system user
    const history = await queryOne<{ changed_by: number; to_state_id: number; note: string }>(
      `SELECT changed_by, to_state_id, note FROM order_state_history
       WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
      [overdueOrderId],
    );
    const systemUserId = (
      await queryOne<{ idusers: number }>(`SELECT idusers FROM users WHERE username='system'`)
    )!.idusers;
    expect(history!.changed_by).toBe(systemUserId);
    expect(history!.to_state_id).toBe(incucaiStateId);
    expect(history!.note).toMatch(/auto/);
  });

  it('re-ejecutar el tick es idempotente (archived=0 si no queda nada elegible)', async () => {
    const res = await request(app)
      .get('/api/v2/internal/archive-overdue-tick')
      .set('Authorization', `Bearer ${CRON_SECRET}`);
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(0);
  });
});
