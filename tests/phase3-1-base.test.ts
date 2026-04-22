// Fase 3.1 — verifica los cambios base de schema:
//   - states.marks_as_delivered existe y el estado 'ENTREGADO' lo tiene en 1.
//   - updateState auto-setea returned_at según el flag, no el nombre.
//   - Las 4 FKs nuevas rechazan filas huérfanas (devices.brand_id,
//     orders.users_id, stock.proveedor_id, stock.branch_id).

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mysql from 'mysql2/promise';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

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

describe('Fase 3.1 — marks_as_delivered flag', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;
  });

  it('el estado ENTREGADO tiene marks_as_delivered = 1 y el resto en 0', async () => {
    const entregado = await queryOne<{ marks_as_delivered: number }>(
      `SELECT marks_as_delivered FROM states WHERE state = 'ENTREGADO'`,
    );
    expect(entregado).not.toBeNull();
    expect(Number(entregado!.marks_as_delivered)).toBe(1);

    const others = await queryOne<{ total: number }>(
      `SELECT COUNT(*) AS total FROM states
       WHERE state != 'ENTREGADO' AND marks_as_delivered != 0`,
    );
    expect(Number(others!.total)).toBe(0);
  });

  it('updateState a un estado flaggeado (no llamado ENTREGADO) setea returned_at', async () => {
    const row = await queryOne<{ id: number; state_id: number }>(
      `SELECT order_id AS id, state_id FROM orders
       WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    const orderId = row!.id;
    const currentStateId = row!.state_id;

    // Creamos un estado custom con nombre distinto de 'ENTREGADO' y flag = 1.
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT!),
      user: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_DBNAME!,
    });
    await conn.query(
      `INSERT INTO states (state, color, marks_as_delivered) VALUES ('DEVUELTO TEST', '#00ff00', 1)`,
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT idstates FROM states WHERE state = 'DEVUELTO TEST' LIMIT 1`,
    );
    const customStateId = Number(rows[0]!.idstates);
    await conn.end();

    expect(customStateId).not.toBe(currentStateId);

    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: customStateId, note: 'custom delivered' });
    expect(res.status).toBe(200);
    expect(res.body.stateId).toBe(customStateId);
    expect(res.body.returnedAt).not.toBeNull();
    expect(res.body.returnedAt).toMatch(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
  });

  it('updateState a un estado NO flaggeado (aunque se llame similar) NO setea returned_at', async () => {
    const row = await queryOne<{ id: number; state_id: number }>(
      `SELECT order_id AS id, state_id FROM orders
       WHERE branches_id = 1 AND returned_at IS NULL
       ORDER BY order_id DESC LIMIT 1`,
    );
    const orderId = row!.id;
    const currentStateId = row!.state_id;

    // Estado llamado 'ENTREGADO EXTRA' pero con el flag en 0 — no debe setear returned_at.
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT!),
      user: process.env.DB_USERNAME!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_DBNAME!,
    });
    await conn.query(
      `INSERT INTO states (state, color, marks_as_delivered) VALUES ('ENTREGADO EXTRA', '#ffcc00', 0)`,
    );
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT idstates FROM states WHERE state = 'ENTREGADO EXTRA' LIMIT 1`,
    );
    const fakeStateId = Number(rows[0]!.idstates);
    await conn.end();

    expect(fakeStateId).not.toBe(currentStateId);

    const res = await request(app)
      .patch(`/api/v2/orders/${orderId}/state`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stateId: fakeStateId });
    expect(res.status).toBe(200);
    expect(res.body.stateId).toBe(fakeStateId);
    expect(res.body.returnedAt).toBeNull();
  });
});

describe('Fase 3.1 — FKs sobre columnas con 0 huérfanos', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

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

  it('devices.brand_id rechaza brand_id inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO devices (brand_id, type_id, model) VALUES (999999, 1, 'model-ghost-3.1')`,
        );
      }),
    );
  });

  it('orders.users_id rechaza users_id inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO orders
             (client_id, device_id, branches_id, current_branch_id, state_id, users_id,
              created_at, problem)
           SELECT c.idclients, d.iddevices, 1, 1, s.idstates, 999999, '01/01/2026', 'fk test'
           FROM clients c, devices d, states s
           WHERE s.deleted_at IS NULL
           LIMIT 1`,
        );
      }),
    );
  });

  it('stock.proveedor_id rechaza proveedor_id inexistente', async () => {
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO stock
             (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo)
           SELECT r.idrepuestos, 1, 0.00, 999999, CURDATE(), 'fk-test-model'
           FROM repuestos r LIMIT 1`,
        );
      }),
    );
  });

  it('stock.branch_id rechaza branch_id inexistente (pero acepta NULL)', async () => {
    // NULL debe aceptarse (columna nullable)
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, branch_id, modelo)
         SELECT r.idrepuestos, 1, 0.00, p.idproveedores, CURDATE(), NULL, 'fk-test-branch-null'
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    // Pero un branch_id inexistente debe fallar
    await expectFkError(() =>
      withConn(async (conn) => {
        await conn.query(
          `INSERT INTO stock
             (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, branch_id, modelo)
           SELECT r.idrepuestos, 1, 0.00, p.idproveedores, CURDATE(), 999999, 'fk-test-branch-bad'
           FROM repuestos r, proveedores p LIMIT 1`,
        );
      }),
    );
  });
});
