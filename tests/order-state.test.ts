import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('GET /api/v2/orders/:id', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;
  let orderInOtherBranch: { id: number } | null = null;
  let orderInPruebaBranch: { id: number } | null = null;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const otherRow = await queryOne<{ username: string; branch_id: number; password: string }>(
      `SELECT username, branch_id, password FROM users
       WHERE deleted_at IS NULL AND username != 'prueba' AND branch_id != 1 LIMIT 1`,
    );
    otherBranchId = Number(otherRow!.branch_id);
    otherToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: otherRow!.username, password: otherRow!.password })
    ).body.token;

    orderInPruebaBranch = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE branches_id = 1 ORDER BY order_id DESC LIMIT 1`,
    );
    orderInOtherBranch = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE branches_id = ? ORDER BY order_id DESC LIMIT 1`,
      [otherBranchId],
    );
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get(`/api/v2/orders/${orderInPruebaBranch!.id}`);
    expect(res.status).toBe(401);
  });

  it('returns the full order detail when the user has access', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderInPruebaBranch!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderInPruebaBranch!.id);
    expect(res.body).toHaveProperty('stateName');
    expect(res.body).toHaveProperty('clientName');
    expect(res.body).toHaveProperty('problem');
  });

  it('returns 404 when a regular user requests an order from another branch', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderInPruebaBranch!.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });

  it('lets prueba see an order from any branch (branches:view_all bypass)', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderInOtherBranch!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(otherBranchId);
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app)
      .get('/api/v2/orders/999999999')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v2/orders/:id/state', () => {
  const app = createApp();
  let pruebaToken = '';
  let orderId = 0;
  let currentStateId = 0;
  let alternateStateId = 0;
  let entregadoStateId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // Elegimos una orden NO entregada (returned_at IS NULL) de branch 1
    // para no arrastrar side effects de returned_at preexistente.
    const row = await queryOne<{ id: number; state_id: number }>(
      `SELECT order_id AS id, state_id FROM orders
       WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    orderId = row!.id;
    currentStateId = row!.state_id;

    const alternate = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states
       WHERE deleted_at IS NULL AND state != 'ENTREGADO' AND idstates != ?
       ORDER BY idstates ASC LIMIT 1`,
      [currentStateId],
    );
    alternateStateId = alternate!.id;

    const entregado = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states WHERE state = 'ENTREGADO' LIMIT 1`,
    );
    entregadoStateId = entregado!.id;
  });

  it('rejects a body without stateId (400)', async () => {
    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });

  it('rejects a stateId that does not exist (409)', async () => {
    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: 999999 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('transitions to another non-delivered state and records history (no returned_at set)', async () => {
    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: alternateStateId, note: 'cambio de prueba' });
    expect(res.status).toBe(200);
    expect(res.body.stateId).toBe(alternateStateId);
    expect(res.body.returnedAt).toBeNull();

    // DB verification: nueva fila en order_state_history
    const historyRow = await queryOne<{
      from_state_id: number;
      to_state_id: number;
      note: string | null;
    }>(
      `SELECT from_state_id, to_state_id, note FROM order_state_history
       WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
      [orderId],
    );
    expect(historyRow!.from_state_id).toBe(currentStateId);
    expect(historyRow!.to_state_id).toBe(alternateStateId);
    expect(historyRow!.note).toBe('cambio de prueba');
  });

  it('rejects a no-op transition (same stateId) with 409', async () => {
    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: alternateStateId }); // ahora ya está ahí
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya está/);
  });

  it('auto-sets returned_at when the new state is "ENTREGADO"', async () => {
    const beforeRow = await queryOne<{ returned_at: string | null }>(
      `SELECT returned_at FROM orders WHERE order_id = ?`,
      [orderId],
    );
    expect(beforeRow!.returned_at).toBeNull();

    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: entregadoStateId });
    expect(res.status).toBe(200);
    expect(res.body.stateId).toBe(entregadoStateId);
    expect(res.body.returnedAt).not.toBeNull();
    // Formato d/m/yyyy o d/mm/yyyy — contiene al menos dos separadores /
    expect(res.body.returnedAt).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);

    const afterRow = await queryOne<{ returned_at: string | null }>(
      `SELECT returned_at FROM orders WHERE order_id = ?`,
      [orderId],
    );
    expect(afterRow!.returned_at).not.toBeNull();
  });
});

describe('GET /api/v2/orders/:id/state-history', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let orderId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const otherRow = await queryOne<{ username: string; password: string }>(
      `SELECT username, password FROM users
       WHERE deleted_at IS NULL AND username != 'prueba' AND branch_id != 1 LIMIT 1`,
    );
    otherToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: otherRow!.username, password: otherRow!.password })
    ).body.token;

    const row = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders
       WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    orderId = row!.id;

    // Hacer dos transiciones para que el history tenga múltiples entries
    const currentState = await queryOne<{ state_id: number }>(
      `SELECT state_id FROM orders WHERE order_id = ?`,
      [orderId],
    );
    const nextState = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states
       WHERE deleted_at IS NULL AND idstates != ? ORDER BY idstates ASC LIMIT 1`,
      [currentState!.state_id],
    );
    await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: nextState!.id, note: 'primer cambio' });
    const anotherState = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states
       WHERE deleted_at IS NULL AND idstates != ? AND idstates != ?
       ORDER BY idstates ASC LIMIT 1`,
      [currentState!.state_id, nextState!.id],
    );
    await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: anotherState!.id, note: 'segundo cambio' });
  });

  it('returns the transitions in chronological order with resolved names', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderId}/state-history`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);

    const [first, second] = res.body.items;
    expect(new Date(first.changedAt).getTime()).toBeLessThanOrEqual(
      new Date(second.changedAt).getTime(),
    );
    expect(first.note).toBe('primer cambio');
    expect(second.note).toBe('segundo cambio');
    expect(first.changedByUsername).toBe('prueba');
    expect(first.toStateName).toBeDefined();
    expect(first.fromStateName).toBeDefined();
  });

  it('returns 404 for an order the user cannot access', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderId}/state-history`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});
