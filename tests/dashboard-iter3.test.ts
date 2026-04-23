// Fase 4 iter 3 — period-compare + problem-details.

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

// Anchor fijo con data conocida en el backup (2023-06-15: mediados de
// junio, ambos rangos `week` y `month` tienen datos).
const ANCHOR = '2023-06-15';
const FROM = '2023-01-01';
const TO = '2023-12-31';

describe('GET /api/v2/dashboard/period-compare', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;

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
  });

  it('requiere token (401)', async () => {
    const res = await request(app).get('/api/v2/dashboard/period-compare?preset=week');
    expect(res.status).toBe(401);
  });

  it('preset requerido (400)', async () => {
    const res = await request(app)
      .get('/api/v2/dashboard/period-compare')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('rechaza preset inválido (400)', async () => {
    const res = await request(app)
      .get('/api/v2/dashboard/period-compare?preset=year')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('preset=week con anchor calcula lunes-domingo y previous 7 días atrás', async () => {
    // anchor=2023-06-15 = jueves. Semana: lunes 12 al domingo 18.
    // Previous: lunes 5 al domingo 11.
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=week&anchor=${ANCHOR}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.preset).toBe('week');
    expect(res.body.anchor).toBe(ANCHOR);
    expect(res.body.current.from).toBe('2023-06-12');
    expect(res.body.current.to).toBe('2023-06-18');
    expect(res.body.previous.from).toBe('2023-06-05');
    expect(res.body.previous.to).toBe('2023-06-11');
  });

  it('preset=month con anchor calcula mes calendario y previous mes anterior', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=month&anchor=${ANCHOR}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.current.from).toBe('2023-06-01');
    expect(res.body.current.to).toBe('2023-06-30');
    expect(res.body.previous.from).toBe('2023-05-01');
    expect(res.body.previous.to).toBe('2023-05-31');
  });

  it('KPIs tienen todos los campos esperados', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=month&anchor=${ANCHOR}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const side of ['current', 'previous'] as const) {
      const s = res.body[side];
      expect(typeof s.ordersCreated).toBe('number');
      expect(typeof s.ordersDelivered).toBe('number');
      expect(typeof s.totalFacturacion).toBe('number');
      // avgDaysToDelivery puede ser null si no hay entregas en el período
      expect(s.avgDaysToDelivery === null || typeof s.avgDaysToDelivery === 'number').toBe(true);
    }
  });

  it('deltas.abs = current - previous para contadores', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=month&anchor=${ANCHOR}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deltas.ordersCreated.abs).toBe(
      res.body.current.ordersCreated - res.body.previous.ordersCreated,
    );
    expect(res.body.deltas.ordersDelivered.abs).toBe(
      res.body.current.ordersDelivered - res.body.previous.ordersDelivered,
    );
    expect(res.body.deltas.totalFacturacion.abs).toBe(
      res.body.current.totalFacturacion - res.body.previous.totalFacturacion,
    );
  });

  it('non-admin forzado a su branch (ignora branchId query)', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=month&anchor=${ANCHOR}&branchId=1`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
  });

  it('admin narrowea con branchId', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/period-compare?preset=month&anchor=${ANCHOR}&branchId=${otherBranchId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
  });

  it('anchor opcional — default a hoy AR', async () => {
    const res = await request(app)
      .get('/api/v2/dashboard/period-compare?preset=month')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('GET /api/v2/dashboard/problem-details', () => {
  const app = createApp();
  let pruebaToken = '';
  let knownToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // Pedimos al top-problems el token #1 — eso garantiza que tiene matches
    // en el rango y evita hardcodear un keyword sensible a la data del backup.
    const top = await request(app)
      .get(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=1`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    knownToken = top.body.items[0]?.token ?? 'pantalla';
  });

  it('requiere token query (400)', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/problem-details?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('requiere from/to (400)', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/problem-details?token=pantalla`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('requiere auth (401)', async () => {
    const res = await request(app).get(
      `/api/v2/dashboard/problem-details?token=pantalla&from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(401);
  });

  it('devuelve breakdowns completos para token conocido', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/problem-details?token=${knownToken}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.token).toBe(knownToken);
    expect(res.body.totalOrders).toBeGreaterThan(0);
    expect(typeof res.body.ordersDelivered).toBe('number');
    expect(res.body.deliveryRate).toBeGreaterThanOrEqual(0);
    expect(res.body.deliveryRate).toBeLessThanOrEqual(1);

    expect(Array.isArray(res.body.byBrand)).toBe(true);
    expect(Array.isArray(res.body.byState)).toBe(true);
    expect(Array.isArray(res.body.byBranch)).toBe(true);

    for (const group of ['byBrand', 'byState', 'byBranch'] as const) {
      for (const row of res.body[group]) {
        expect(typeof row.key).toBe('string');
        expect(typeof row.count).toBe('number');
        expect(row.count).toBeGreaterThan(0);
      }
    }

    expect(Array.isArray(res.body.samples)).toBe(true);
    expect(res.body.samples.length).toBeLessThanOrEqual(5);
    for (const s of res.body.samples) expect(typeof s).toBe('string');
  });

  it('sum de byBranch = totalOrders (cada orden está en una sola sucursal)', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/problem-details?token=${knownToken}&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    const sum = (res.body.byBranch as Array<{ count: number }>).reduce(
      (acc, r) => acc + r.count,
      0,
    );
    expect(sum).toBe(res.body.totalOrders);
  });

  it('token sin matches devuelve zeros y arrays vacíos', async () => {
    const res = await request(app)
      .get(
        `/api/v2/dashboard/problem-details?token=zzznomatchzzz&from=${FROM}&to=${TO}`,
      )
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBe(0);
    expect(res.body.ordersDelivered).toBe(0);
    expect(res.body.deliveryRate).toBe(0);
    expect(res.body.avgDaysToDelivery).toBeNull();
    expect(res.body.byBrand).toEqual([]);
    expect(res.body.byState).toEqual([]);
    expect(res.body.byBranch).toEqual([]);
    expect(res.body.samples).toEqual([]);
  });

  it('tokens con wildcards LIKE (%) no escapan — se buscan literalmente', async () => {
    // Si escapLike no funcionara, el `%` podría matchear cualquier cosa y
    // devolver todo el dataset.
    const res = await request(app)
      .get(`/api/v2/dashboard/problem-details?token=%25&from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    // Si el wildcard no se escapara, totalOrders sería enorme. Tiene que
    // ser 0 o un número razonable (filas que literalmente tienen `%`).
    expect(res.body.totalOrders).toBeLessThan(50);
  });
});
