// Fase 4 iter 2 — dashboard de estadísticas (4 endpoints).

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

// Rango histórico fijo con data conocida en el backup (2023 tiene órdenes y
// movname rows suficientes para asserts no-triviales).
const FROM = '2023-01-01';
const TO = '2023-12-31';

describe('GET /api/v2/dashboard/orders-over-time', () => {
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
    const res = await request(app).get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(401);
  });

  it('valida from/to obligatorios', async () => {
    const res = await request(app)
      .get('/api/v2/dashboard/orders-over-time')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('devuelve buckets diarios con created+delivered', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&granularity=day`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.granularity).toBe('day');
    expect(res.body.buckets).toBeInstanceOf(Array);
    expect(res.body.buckets.length).toBeGreaterThan(0);
    for (const b of res.body.buckets) {
      expect(b.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof b.created).toBe('number');
      expect(typeof b.delivered).toBe('number');
    }
    // Orden ascendente
    const keys = res.body.buckets.map((b: { bucket: string }) => b.bucket);
    for (let i = 1; i < keys.length; i++) expect(keys[i] >= keys[i - 1]).toBe(true);
  });

  it('granularity=month agrupa por mes', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&granularity=month`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    // 12 meses posibles en un año de rango; esperamos <= 12 buckets
    expect(res.body.buckets.length).toBeLessThanOrEqual(12);
    for (const b of res.body.buckets) {
      expect(b.bucket).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it('granularity=week usa lunes como clave', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&granularity=week`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const b of res.body.buckets) {
      expect(b.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Lunes: getDay() === 1 en JS (UTC parseable)
      const d = new Date(b.bucket + 'T00:00:00Z');
      expect(d.getUTCDay()).toBe(1);
    }
  });

  it('non-admin ve sólo su branch (branchId query ignorado)', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&branchId=1`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
  });

  it('admin puede narrowear con branchId', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&branchId=${otherBranchId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
  });
});

describe('GET /api/v2/dashboard/revenue', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;
  });

  it('requiere token (401)', async () => {
    const res = await request(app).get(`/api/v2/dashboard/revenue?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(401);
  });

  it('devuelve totalFacturacion + breakdown + buckets', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/revenue?from=${FROM}&to=${TO}&granularity=month`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.totalFacturacion).toBe('number');
    expect(Array.isArray(res.body.breakdown)).toBe(true);
    expect(Array.isArray(res.body.buckets)).toBe(true);
  });

  it('breakdown incluye combinaciones ingreso/egreso con count + total', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/revenue?from=${FROM}&to=${TO}&granularity=month`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const row of res.body.breakdown) {
      expect(typeof row.ingreso).toBe('string');
      expect(typeof row.egreso).toBe('string');
      expect(typeof row.count).toBe('number');
      expect(typeof row.total).toBe('number');
    }
  });

  it('totalFacturacion = suma de los buckets', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/revenue?from=${FROM}&to=${TO}&granularity=month`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    const sumBuckets = res.body.buckets.reduce(
      (acc: number, b: { facturacion: number }) => acc + b.facturacion,
      0,
    );
    expect(sumBuckets).toBe(res.body.totalFacturacion);
  });

  it('rango vacío devuelve 0 y arrays vacíos', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/revenue?from=1990-01-01&to=1990-12-31&granularity=month`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalFacturacion).toBe(0);
    expect(res.body.buckets).toEqual([]);
    expect(res.body.breakdown).toEqual([]);
  });
});

describe('GET /api/v2/dashboard/top-problems', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;
  });

  it('requiere token (401)', async () => {
    const res = await request(app).get(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(401);
  });

  it('devuelve items ordenados por count DESC con tokens normalizados', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=10`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeLessThanOrEqual(10);
    expect(typeof res.body.totalOrdersScanned).toBe('number');

    for (const item of res.body.items) {
      expect(typeof item.token).toBe('string');
      expect(item.token.length).toBeGreaterThanOrEqual(4);
      expect(typeof item.count).toBe('number');
      // normalizado: sólo a-z 0-9 ñ
      expect(item.token).toMatch(/^[a-z0-9ñ]+$/);
    }
    // orden DESC
    for (let i = 1; i < res.body.items.length; i++) {
      expect(res.body.items[i - 1].count).toBeGreaterThanOrEqual(res.body.items[i].count);
    }
  });

  it('respeta límite', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=3`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(3);
  });
});

describe('GET /api/v2/dashboard/branch-performance', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;
  });

  it('requiere token (401)', async () => {
    const res = await request(app).get(
      `/api/v2/dashboard/branch-performance?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(401);
  });

  it('incluye branches sin órdenes en el rango (LEFT JOIN)', async () => {
    const branchCount = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM branches WHERE deleted_at IS NULL`,
    );
    const res = await request(app)
      .get(`/api/v2/dashboard/branch-performance?from=1990-01-01&to=1990-12-31`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(Number(branchCount!.cnt));
    for (const b of res.body.items) {
      expect(b.ordersCreated).toBe(0);
      expect(b.ordersDelivered).toBe(0);
      expect(b.deliveryRate).toBe(0);
      expect(b.avgDaysToDelivery).toBeNull();
    }
  });

  it('items tienen forma completa y deliveryRate ∈ [0,1]', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/branch-performance?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const b of res.body.items) {
      expect(typeof b.branchId).toBe('number');
      expect(typeof b.branchName).toBe('string');
      expect(typeof b.ordersCreated).toBe('number');
      expect(typeof b.ordersDelivered).toBe('number');
      expect(b.deliveredWithin7Days).toBeLessThanOrEqual(b.ordersDelivered);
      expect(b.deliveryRate).toBeGreaterThanOrEqual(0);
      expect(b.deliveryRate).toBeLessThanOrEqual(1);
      if (b.avgDaysToDelivery !== null) expect(b.avgDaysToDelivery).toBeGreaterThanOrEqual(0);
    }
  });

  it('ordenado por ordersCreated DESC', async () => {
    const res = await request(app)
      .get(`/api/v2/dashboard/branch-performance?from=${FROM}&to=${TO}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.items.length; i++) {
      expect(res.body.items[i - 1].ordersCreated).toBeGreaterThanOrEqual(
        res.body.items[i].ordersCreated,
      );
    }
  });
});
