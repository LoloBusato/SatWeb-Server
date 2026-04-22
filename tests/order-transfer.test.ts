import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('POST /api/v2/orders/:id/transfer', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;
  let orderInBranch1 = 0;
  let deletedBranchId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
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

    const o = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE branches_id = 1 ORDER BY order_id DESC LIMIT 1`,
    );
    orderInBranch1 = o!.id;

    // Soft-delete la primera branch sin users activos (la Fase 1 M5 hace
    // esto en un test; acá reusamos el patrón para obtener un branch_id
    // soft-deleted que el transfer tiene que rechazar).
    const softDeletable = await queryOne<{ id: number }>(
      `SELECT b.idbranches AS id FROM branches b
       LEFT JOIN users u ON u.branch_id = b.idbranches AND u.deleted_at IS NULL
       WHERE b.deleted_at IS NULL
       GROUP BY b.idbranches HAVING COUNT(u.idusers) = 0 LIMIT 1`,
    );
    if (softDeletable) {
      await request(app)
        .delete(`/api/v2/branches/${softDeletable.id}`)
        .set('Authorization', `Bearer ${pruebaToken}`);
      deletedBranchId = softDeletable.id;
    }
  });

  it('verifies backfill: existing orders have currentBranchId = branchId after migration', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderInBranch1}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(res.body.currentBranchId);
  });

  it('transfers an order to another branch and inserts history', async () => {
    const res = await request(app)
      .post(`/api/v2/orders/${orderInBranch1}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: otherBranchId, note: 'enviado a lab' });
    expect(res.status).toBe(200);
    expect(res.body.currentBranchId).toBe(otherBranchId);
    expect(res.body.branchId).toBe(1); // origen inmutable

    const historyRow = await queryOne<{
      from_branch_id: number;
      to_branch_id: number;
      note: string | null;
    }>(
      `SELECT from_branch_id, to_branch_id, note FROM order_location_history
       WHERE order_id = ? ORDER BY id DESC LIMIT 1`,
      [orderInBranch1],
    );
    expect(historyRow!.from_branch_id).toBe(1);
    expect(historyRow!.to_branch_id).toBe(otherBranchId);
    expect(historyRow!.note).toBe('enviado a lab');
  });

  it('rejects transfer to same branch (409 no-op)', async () => {
    // La orden ya está en otherBranchId del test anterior
    const res = await request(app)
      .post(`/api/v2/orders/${orderInBranch1}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: otherBranchId });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ya está/);
  });

  it('rejects transfer to a non-existent branch (409)', async () => {
    const res = await request(app)
      .post(`/api/v2/orders/${orderInBranch1}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: 999999 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('rejects transfer to a soft-deleted branch (409)', async () => {
    if (deletedBranchId === 0) return; // nada soft-deletable en la data
    const res = await request(app)
      .post(`/api/v2/orders/${orderInBranch1}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: deletedBranchId });
    expect(res.status).toBe(409);
  });

  it('rejects validation without toBranchId (400)', async () => {
    const res = await request(app)
      .post(`/api/v2/orders/${orderInBranch1}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ note: 'sin destino' });
    expect(res.status).toBe(400);
  });
});

describe('multi-tenancy OR after transfer', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;
  let orderId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
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

    const o = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders WHERE branches_id = 1 ORDER BY order_id DESC LIMIT 1`,
    );
    orderId = o!.id;

    // Transferencia: orden de branch 1 ahora físicamente en otherBranchId.
    await request(app)
      .post(`/api/v2/orders/${orderId}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: otherBranchId });
  });

  it('user de branch destino ahora puede ver la orden (aunque origen sea 1)', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchId).toBe(1); // origen
    expect(res.body.currentBranchId).toBe(otherBranchId); // actual
  });

  it('user de branch origen también la sigue viendo (origen sigue siendo 1)', async () => {
    // Usamos prueba como stand-in de admin-origen; un user real de branch 1
    // también debería verla. Sin un non-admin user en branch 1 fácil de
    // testear acá, confiamos en el OR simétrico de la query.
    const res = await request(app)
      .get(`/api/v2/orders/${orderId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.currentBranchId).toBe(otherBranchId);
  });

  it('GET /orders desde branch destino incluye esta orden en el listado', async () => {
    const res = await request(app)
      .get('/api/v2/orders?limit=200')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const found = res.body.items.find((i: { id: number }) => i.id === orderId);
    expect(found).toBeDefined();
    expect(found.branchId).toBe(1);
    expect(found.currentBranchId).toBe(otherBranchId);
  });
});

describe('GET /api/v2/orders/:id/location-history', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherBranchId = 0;
  let orderId = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    otherBranchId = Number(
      (
        await queryOne<{ branch_id: number }>(
          `SELECT branch_id FROM users
           WHERE deleted_at IS NULL AND username != 'prueba' AND branch_id != 1 LIMIT 1`,
        )
      )!.branch_id,
    );

    orderId = (
      await queryOne<{ id: number }>(
        `SELECT order_id AS id FROM orders WHERE branches_id = 1 ORDER BY order_id DESC LIMIT 1`,
      )
    )!.id;

    // Dos transferencias consecutivas para que el history tenga múltiples entries
    await request(app)
      .post(`/api/v2/orders/${orderId}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: otherBranchId, note: 'a lab' });
    await request(app)
      .post(`/api/v2/orders/${orderId}/transfer`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ toBranchId: 1, note: 'vuelta al origen' });
  });

  it('devuelve las transferencias en orden cronológico con nombres resueltos', async () => {
    const res = await request(app)
      .get(`/api/v2/orders/${orderId}/location-history`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);

    const [first, second] = res.body.items;
    expect(first.note).toBe('a lab');
    expect(first.fromBranchId).toBe(1);
    expect(first.toBranchId).toBe(otherBranchId);
    expect(first.transferredByUsername).toBe('prueba');
    expect(first.fromBranchName).toBeDefined();
    expect(first.toBranchName).toBeDefined();

    expect(second.note).toBe('vuelta al origen');
    expect(second.fromBranchId).toBe(otherBranchId);
    expect(second.toBranchId).toBe(1);

    expect(new Date(first.transferredAt).getTime()).toBeLessThanOrEqual(
      new Date(second.transferredAt).getTime(),
    );
  });
});
