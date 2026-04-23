// Fase 4 iteración 1 — /api/v2/operations (listado + summary).
// Cubre auth, branch-scope, filtros por fecha/query, paginación,
// y que la unión orders + sales tenga los items esperados.

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

describe('GET /api/v2/operations', () => {
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

  it('requiere token (401 sin header)', async () => {
    const res = await request(app).get('/api/v2/operations');
    expect(res.status).toBe(401);
  });

  it('admin (prueba, branches:view_all) ve todas las sucursales por default', async () => {
    const res = await request(app)
      .get('/api/v2/operations?limit=20')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(Number(res.body.total)).toBeGreaterThan(0);
    expect(res.body.branchFilter).toBeNull();

    const branchIds = new Set<number>(res.body.items.map((i: { branchId: number }) => i.branchId));
    expect(branchIds.size).toBeGreaterThanOrEqual(1);
  });

  it('user no-admin ve sólo su propia sucursal (aunque pase otra en query)', async () => {
    const res = await request(app)
      .get(`/api/v2/operations?branchId=1&limit=20`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
    const otherBranchIds = new Set<number>(
      res.body.items.map((i: { branchId: number }) => i.branchId),
    );
    for (const bid of otherBranchIds) {
      expect(bid).toBe(otherBranchId);
    }
  });

  it('admin puede narrowear con branchId=X', async () => {
    const res = await request(app)
      .get(`/api/v2/operations?branchId=${otherBranchId}&limit=20`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
    for (const item of res.body.items) {
      expect(item.branchId).toBe(otherBranchId);
    }
  });

  it('items tienen kind, id, date, branchId, branchName, label', async () => {
    const res = await request(app)
      .get('/api/v2/operations?limit=5')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(['order', 'sale']).toContain(item.kind);
      expect(typeof item.id).toBe('number');
      expect(typeof item.branchId).toBe('number');
      expect(typeof item.branchName).toBe('string');
      expect(typeof item.label).toBe('string');
      expect(typeof item.date).toBe('string'); // ISO string
    }
  });

  it('items vienen ordenados por date DESC', async () => {
    const res = await request(app)
      .get('/api/v2/operations?limit=100')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    const dates = res.body.items.map((i: { date: string }) => new Date(i.date).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  it('pagina con limit/offset y total refleja el dataset completo', async () => {
    const page1 = await request(app)
      .get('/api/v2/operations?limit=3&offset=0')
      .set('Authorization', `Bearer ${pruebaToken}`);
    const page2 = await request(app)
      .get('/api/v2/operations?limit=3&offset=3')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.items.length).toBe(3);
    expect(page2.body.items.length).toBe(3);
    expect(page1.body.total).toBe(page2.body.total);

    const ids1 = page1.body.items.map((i: { kind: string; id: number }) => `${i.kind}:${i.id}`);
    const ids2 = page2.body.items.map((i: { kind: string; id: number }) => `${i.kind}:${i.id}`);
    for (const id of ids2) expect(ids1).not.toContain(id);
  });

  it('filtra por rango de fechas (rango histórico fijo)', async () => {
    const res = await request(app)
      .get('/api/v2/operations?from=2023-01-01&to=2023-12-31&limit=200')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);

    const min = new Date('2023-01-01T00:00:00').getTime();
    const max = new Date('2024-01-01T00:00:00').getTime();
    for (const item of res.body.items) {
      const d = new Date(item.date).getTime();
      expect(d).toBeGreaterThanOrEqual(min);
      expect(d).toBeLessThan(max);
    }
  });

  it('valida from/to en formato ISO (400)', async () => {
    const res = await request(app)
      .get('/api/v2/operations?from=23/4/2026')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('rechaza to < from (400)', async () => {
    const res = await request(app)
      .get('/api/v2/operations?from=2026-12-31&to=2026-01-01')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(400);
  });

  it('filter query busca por cliente/modelo/orderId o repuesto', async () => {
    const all = await request(app)
      .get('/api/v2/operations?limit=200')
      .set('Authorization', `Bearer ${pruebaToken}`);
    const totalNoQuery = all.body.total;

    const res = await request(app)
      .get('/api/v2/operations?query=Orden%20%23&limit=200')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThanOrEqual(totalNoQuery);
    // Todas las rows que matchearon deben tener "Orden #" en el label
    // (o el match viene de repuesto_name para sales — pero 'Orden #' no
    // aparece naturalmente en nombres de repuestos)
    const labels = res.body.items.map((i: { label: string }) => i.label);
    // Al menos una debe tener el prefix 'Orden #' — la mayoría deberían
    expect(labels.some((l: string) => l.startsWith('Orden #'))).toBe(true);
  });
});

describe('GET /api/v2/operations/summary', () => {
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
    const res = await request(app).get('/api/v2/operations/summary');
    expect(res.status).toBe(401);
  });

  it('devuelve orderCount + saleCount + totalCount (totalCount = suma)', async () => {
    const res = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orderCount).toBeGreaterThanOrEqual(0);
    expect(res.body.saleCount).toBeGreaterThanOrEqual(0);
    expect(res.body.totalCount).toBe(res.body.orderCount + res.body.saleCount);
  });

  it('summary coincide con el total del listado (sin filtros)', async () => {
    const summary = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);
    const list = await request(app)
      .get('/api/v2/operations?limit=1')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(summary.body.totalCount).toBe(list.body.total);
  });

  it('summary respeta branch scope del user no-admin', async () => {
    const fullRes = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);
    const scopedRes = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(scopedRes.status).toBe(200);
    expect(scopedRes.body.branchFilter).toBe(otherBranchId);
    expect(scopedRes.body.totalCount).toBeLessThanOrEqual(fullRes.body.totalCount);
  });

  it('incluye orden nueva cuando se marca como entregada por v2', async () => {
    // Snapshot antes
    const before = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);

    // Tomamos una orden no-entregada Y con state_id != ENTREGADO (por si
    // alguna fila legacy quedó inconsistente: returned_at=NULL pero
    // state_id=entregado hace que updateState rechace con 409).
    const entregado = await queryOne<{ id: number }>(
      `SELECT idstates AS id FROM states WHERE marks_as_delivered = 1 LIMIT 1`,
    );
    const target = await queryOne<{ id: number }>(
      `SELECT order_id AS id FROM orders
       WHERE returned_at IS NULL AND state_id != ? LIMIT 1`,
      [entregado!.id],
    );

    const patchRes = await request(app)
      .patch(`/api/v2/orders/${target!.id}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: entregado!.id });
    expect(patchRes.status).toBe(200);

    // El trigger BEFORE UPDATE debería haber seteado returned_at_dt; ahora
    // la orden debe aparecer en el summary.
    const after = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(after.body.orderCount).toBe(before.body.orderCount + 1);
  });

  it('incluye venta nueva cuando se inserta en reducestock con orderid NULL', async () => {
    const before = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);

    const ctx = await queryOne<{ user_id: number; sb_id: number }>(
      `SELECT (SELECT idusers FROM users WHERE deleted_at IS NULL LIMIT 1) AS user_id,
              (SELECT stockbranchid FROM stockbranch LIMIT 1) AS sb_id`,
    );

    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO reducestock (orderid, userid, stockbranch_id, \`date\`)
         VALUES (NULL, ?, ?, '23/4/2026 10:00:00')`,
        [ctx!.user_id, ctx!.sb_id],
      );
    });

    const after = await request(app)
      .get('/api/v2/operations/summary')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(after.body.saleCount).toBe(before.body.saleCount + 1);
  });
});
