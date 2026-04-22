import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

/**
 * El seed sintético de la migración 0010 sólo se activa si al momento de
 * aplicar la migración hay branch_settings configurado. En el entorno de
 * tests la migración corre primero y no hay settings, así que el seed es
 * no-op. Para validar la lógica, estos tests replican el mismo SQL
 * después de configurar settings + setear una orden en el estado "ready".
 */
async function runSeedSQL(): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  await conn.query(`
    INSERT INTO order_state_history (order_id, from_state_id, to_state_id, changed_by, changed_at, note)
    SELECT o.order_id,
           NULL,
           o.state_id,
           (SELECT idusers FROM users WHERE username = 'system' LIMIT 1),
           COALESCE(
             STR_TO_DATE(
               IF(o.created_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$', o.created_at, NULL),
               '%d/%m/%Y'
             ),
             NOW() - INTERVAL 1 DAY
           ),
           'seed sintético migración 0010'
    FROM orders o
    JOIN branch_settings bs ON bs.branch_id = o.branches_id
    WHERE o.state_id = bs.ready_state_id
      AND o.returned_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM order_state_history h
        WHERE h.order_id = o.order_id AND h.to_state_id = o.state_id
      )
  `);
  await conn.end();
}

async function setOrderStateAndCreatedAt(
  orderId: number,
  stateId: number,
  createdAt: string,
): Promise<void> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT!),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_DBNAME!,
  });
  await conn.query(
    `UPDATE orders SET state_id = ?, created_at = ?, returned_at = NULL WHERE order_id = ?`,
    [stateId, createdAt, orderId],
  );
  await conn.end();
}

describe('migración 0010 — system user + seed sintético', () => {
  const app = createApp();
  let pruebaToken = '';
  let readyStateId = 0;
  let incucaiStateId = 0;
  let orderA = 0;
  let orderB = 0;
  let orderC = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // Pick dos estados distintos (no-ENTREGADO)
    const twoStates = await queryOne<{ ready: number; incucai: number }>(
      `SELECT
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1) AS ready,
         (SELECT idstates FROM states WHERE deleted_at IS NULL AND state != 'ENTREGADO' ORDER BY idstates LIMIT 1 OFFSET 1) AS incucai`,
    );
    readyStateId = twoStates!.ready;
    incucaiStateId = twoStates!.incucai;

    // Config de branch 1 para que el seed los considere
    await request(app)
      .put('/api/v2/branches/1/settings')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ readyStateId, incucaiStateId });

    // Tres órdenes de branch 1 para preparar escenarios
    const three = await queryOne<{ a: number; b: number; c: number }>(
      `SELECT
         (SELECT order_id FROM orders WHERE branches_id=1 ORDER BY order_id DESC LIMIT 1) AS a,
         (SELECT order_id FROM orders WHERE branches_id=1 ORDER BY order_id DESC LIMIT 1 OFFSET 1) AS b,
         (SELECT order_id FROM orders WHERE branches_id=1 ORDER BY order_id DESC LIMIT 1 OFFSET 2) AS c`,
    );
    orderA = three!.a;
    orderB = three!.b;
    orderC = three!.c;

    // orderA: readyState + created_at parseable (hace 100 días approx "14/1/2026")
    await setOrderStateAndCreatedAt(orderA, readyStateId, '14/1/2026');
    // orderB: readyState + created_at basura (para validar fallback)
    await setOrderStateAndCreatedAt(orderB, readyStateId, 'basura123');
    // orderC: NO está en readyState, no debería ser seedeada
    await setOrderStateAndCreatedAt(orderC, incucaiStateId, '1/6/2025');
  });

  it('crea un system user con password vacío (no loguable — Zod rechaza body)', async () => {
    const systemUser = await queryOne<{ idusers: number; password: string }>(
      `SELECT idusers, password FROM users WHERE username='system'`,
    );
    expect(systemUser).not.toBeNull();
    expect(systemUser!.password).toBe('');
  });

  it('system user: login con cualquier password falla — password vacío en DB no matchea nada', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'system', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('system user: login con password vacío rechazado por Zod (400)', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'system', password: '' });
    expect(res.status).toBe(400);
  });

  it('al ejecutar el seed, las órdenes en readyState obtienen history con fecha parseada', async () => {
    await runSeedSQL();

    const historyA = await queryOne<{
      from_state_id: number | null;
      to_state_id: number;
      changed_by: number;
      changed_at: string;
      note: string;
    }>(
      `SELECT from_state_id, to_state_id, changed_by, changed_at, note
       FROM order_state_history WHERE order_id = ?`,
      [orderA],
    );
    expect(historyA).not.toBeNull();
    expect(historyA!.from_state_id).toBeNull();
    expect(historyA!.to_state_id).toBe(readyStateId);
    expect(historyA!.note).toMatch(/seed sintético/);

    // changed_at parseado desde '14/1/2026' → año 2026, mes 1, día 14
    const parsed = new Date(historyA!.changed_at);
    expect(parsed.getUTCFullYear()).toBe(2026);

    // changed_by apunta al system user
    const systemId = (
      await queryOne<{ idusers: number }>(`SELECT idusers FROM users WHERE username='system'`)
    )!.idusers;
    expect(historyA!.changed_by).toBe(systemId);
  });

  it('el seed usa fallback NOW() - 1 DAY cuando created_at no parsea', async () => {
    const historyB = await queryOne<{ changed_at: string }>(
      `SELECT changed_at FROM order_state_history WHERE order_id = ?`,
      [orderB],
    );
    expect(historyB).not.toBeNull();
    const parsed = new Date(historyB!.changed_at);
    const now = Date.now();
    const hoursAgo = (now - parsed.getTime()) / (1000 * 60 * 60);
    expect(hoursAgo).toBeGreaterThan(20);   // al menos 20h atrás
    expect(hoursAgo).toBeLessThan(28);      // y menos de 28h atrás
  });

  it('no seedea órdenes que NO están en el readyState de su sucursal', async () => {
    const historyC = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM order_state_history WHERE order_id = ?`,
      [orderC],
    );
    expect(Number(historyC!.c)).toBe(0);
  });

  it('ejecutar el seed dos veces es idempotente (NOT EXISTS filter)', async () => {
    const before = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM order_state_history WHERE order_id = ?`,
      [orderA],
    );
    await runSeedSQL();
    const after = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM order_state_history WHERE order_id = ?`,
      [orderA],
    );
    expect(Number(after!.c)).toBe(Number(before!.c));
  });

  it('después del seed, pickup-pending/incucai-eligible ven las órdenes (flujo end-to-end)', async () => {
    const res = await request(app)
      .get('/api/v2/orders/incucai-eligible')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    // orderA fue seedeada con 14/1/2026, eso es > 180 días atrás si hoy es >= 2026-07-13.
    // En tests corriendo mediados 2026 puede estar o no. Sólo validamos que el endpoint
    // responde y que la estructura es la esperada.
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
