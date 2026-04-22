import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

async function setHistoryDaysAgo(orderId: number, toStateId: number, daysAgo: number): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  await conn.query(
    `INSERT INTO order_state_history (order_id, from_state_id, to_state_id, changed_by, changed_at, note)
     VALUES (?, NULL, ?, (SELECT idusers FROM users WHERE username='prueba' LIMIT 1),
             NOW() - INTERVAL ? DAY, 'test backdate')`,
    [orderId, toStateId, daysAgo],
  );
  await conn.end();
}

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

describe('GET/PUT /api/v2/branches/:id/settings', () => {
  const app = createApp();
  let pruebaToken = '';
  let nonAdminToken = '';
  let readyStateId = 0;
  let incucaiStateId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const nonAdmin = await queryOne<{ username: string; password: string }>(
      `SELECT username, password FROM users
       WHERE deleted_at IS NULL AND username != 'prueba' LIMIT 1`,
    );
    nonAdminToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: nonAdmin!.username, password: nonAdmin!.password })
    ).body.token;

    const twoStates = await queryOne<{ ready: number; incucai: number }>(
      `SELECT
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1) AS ready,
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1 OFFSET 1) AS incucai`,
    );
    readyStateId = twoStates!.ready;
    incucaiStateId = twoStates!.incucai;
  });

  it('GET returns null before any PUT', async () => {
    const res = await request(app)
      .get('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('PUT with valid body creates settings', async () => {
    const res = await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId, pickupReminderHours: 24, incucaiAfterDays: 90 });
    expect(res.status).toBe(200);
    expect(res.body.readyStateId).toBe(readyStateId);
    expect(res.body.incucaiStateId).toBe(incucaiStateId);
    expect(res.body.pickupReminderHours).toBe(24);
    expect(res.body.incucaiAfterDays).toBe(90);
  });

  it('PUT is idempotent (upsert): updates existing settings', async () => {
    const res = await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId, pickupReminderHours: 48 });
    expect(res.status).toBe(200);
    expect(res.body.pickupReminderHours).toBe(48);
    expect(res.body.incucaiAfterDays).toBe(180); // default applied
  });

  it('PUT rejects readyStateId === incucaiStateId with 409', async () => {
    const res = await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId: readyStateId });
    expect(res.status).toBe(409);
  });

  it('PUT rejects invalid stateId with 409', async () => {
    const res = await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId: 999999, incucaiStateId });
    expect(res.status).toBe(409);
  });

  it('rejects non-admin with 403', async () => {
    const res = await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ readyStateId, incucaiStateId });
    expect(res.status).toBe(403);
  });
});

describe('pickup-pending + incucai-eligible + archive-overdue', () => {
  const app = createApp();
  let pruebaToken = '';
  let readyStateId = 0;
  let incucaiStateId = 0;
  let freshOrderId = 0;
  let pendingOrderId = 0;
  let overdueOrderId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // Elegimos dos estados distintos no-ENTREGADO
    const twoStates = await queryOne<{ ready: number; incucai: number }>(
      `SELECT
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1) AS ready,
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1 OFFSET 1) AS incucai`,
    );
    readyStateId = twoStates!.ready;
    incucaiStateId = twoStates!.incucai;

    // Config de branch 1: pickupReminderHours=48h, incucaiAfterDays=180d (defaults)
    await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId });

    // Tomamos 3 órdenes distintas de branch 1 y las configuramos:
    //   freshOrder:   ready, history backdated 6 horas  → ni pickup ni incucai
    //   pendingOrder: ready, history backdated 3 días    → pickup pero no incucai
    //   overdueOrder: ready, history backdated 200 días  → ambas
    const threeOrders = await queryOne<{ a: number; b: number; c: number }>(
      `SELECT
         (SELECT order_id FROM orders WHERE branches_id=1 AND returned_at IS NULL ORDER BY order_id DESC LIMIT 1) AS a,
         (SELECT order_id FROM orders WHERE branches_id=1 AND returned_at IS NULL ORDER BY order_id DESC LIMIT 1 OFFSET 1) AS b,
         (SELECT order_id FROM orders WHERE branches_id=1 AND returned_at IS NULL ORDER BY order_id DESC LIMIT 1 OFFSET 2) AS c`,
    );
    freshOrderId = threeOrders!.a;
    pendingOrderId = threeOrders!.b;
    overdueOrderId = threeOrders!.c;

    for (const id of [freshOrderId, pendingOrderId, overdueOrderId]) {
      await setOrderState(id, readyStateId);
    }
    await setHistoryDaysAgo(freshOrderId, readyStateId, 0); // 0d = fresh
    await setHistoryDaysAgo(pendingOrderId, readyStateId, 3); // 3d > 2d (48h) but < 180d
    await setHistoryDaysAgo(overdueOrderId, readyStateId, 200); // > 180d
  });

  it('GET /pickup-pending includes pending and overdue, excludes fresh', async () => {
    const res = await request(app)
      .get('/api/v2/orders/pickup-pending')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    const ids = new Set(res.body.items.map((i: { id: number }) => i.id));
    expect(ids.has(pendingOrderId)).toBe(true);
    expect(ids.has(overdueOrderId)).toBe(true);
    expect(ids.has(freshOrderId)).toBe(false);
  });

  it('GET /incucai-eligible includes only overdue', async () => {
    const res = await request(app)
      .get('/api/v2/orders/incucai-eligible')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    const ids = new Set(res.body.items.map((i: { id: number }) => i.id));
    expect(ids.has(overdueOrderId)).toBe(true);
    expect(ids.has(pendingOrderId)).toBe(false);
    expect(ids.has(freshOrderId)).toBe(false);
  });

  it('POST /archive-overdue moves overdue to incucai and records history', async () => {
    const res = await request(app)
      .post('/api/v2/orders/archive-overdue')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.archived).toBeGreaterThanOrEqual(1);
    expect(res.body.orderIds).toContain(overdueOrderId);

    const row = await queryOne<{ state_id: number }>(
      `SELECT state_id FROM orders WHERE order_id = ?`,
      [overdueOrderId],
    );
    expect(row!.state_id).toBe(incucaiStateId);

    const history = await queryOne<{ to_state_id: number; note: string }>(
      `SELECT to_state_id, note FROM order_state_history
       WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
      [overdueOrderId],
    );
    expect(history!.to_state_id).toBe(incucaiStateId);
    expect(history!.note).toMatch(/auto/);
  });

  it('re-running archive-overdue is a no-op (nothing still eligible)', async () => {
    const res = await request(app)
      .post('/api/v2/orders/archive-overdue')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(0);
  });
});
