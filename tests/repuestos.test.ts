import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('Repuestos CRUD (/api/v2/repuestos)', () => {
  const app = createApp();
  let pruebaToken = '';
  let nonAdminToken = '';
  let deviceIdA = 0;
  let deviceIdB = 0;
  let repuestoConStockId = 0;

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

    const twoDevices = await queryOne<{ a: number; b: number }>(
      `SELECT
         (SELECT iddevices FROM devices ORDER BY iddevices LIMIT 1) AS a,
         (SELECT iddevices FROM devices ORDER BY iddevices LIMIT 1 OFFSET 1) AS b`,
    );
    deviceIdA = twoDevices!.a;
    deviceIdB = twoDevices!.b;

    const conStock = await queryOne<{ repuesto_id: number }>(
      `SELECT s.repuesto_id FROM stock s
       JOIN stockbranch sb ON sb.stock_id = s.idstock
       WHERE sb.cantidad_restante > 0 LIMIT 1`,
    );
    repuestoConStockId = conStock!.repuesto_id;
  });

  it('GET /repuestos devuelve los activos con deviceIds resueltos', async () => {
    const res = await request(app)
      .get('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    const sample = res.body.items[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('name');
    expect(sample).toHaveProperty('deviceIds');
    expect(Array.isArray(sample.deviceIds)).toBe(true);
    expect(sample).toHaveProperty('precioVentaSugerido'); // null para los legacy
  });

  it('GET /repuestos no incluye soft-deleted (mostrar=0)', async () => {
    // Hay al menos uno en el backup con mostrar=0 — verificamos que no aparece.
    const softDeletedCount = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM repuestos WHERE mostrar = 0`,
    );
    if ((softDeletedCount?.c ?? 0) > 0) {
      const res = await request(app)
        .get('/api/v2/repuestos')
        .set('Authorization', `Bearer ${pruebaToken}`);
      const softIds = await queryOne<{ id: number }>(
        `SELECT idrepuestos AS id FROM repuestos WHERE mostrar = 0 LIMIT 1`,
      );
      const found = res.body.items.find((i: { id: number }) => i.id === softIds!.id);
      expect(found).toBeUndefined();
    }
  });

  it('POST crea un repuesto con precio y deviceIds', async () => {
    const res = await request(app)
      .post('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        name: 'TEST_PIEZA_2_5',
        cantidadLimite: 3,
        venta: true,
        precioVentaSugerido: 125.5,
        deviceIds: [deviceIdA, deviceIdB],
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('TEST_PIEZA_2_5');
    expect(res.body.cantidadLimite).toBe(3);
    expect(res.body.venta).toBe(true);
    expect(res.body.precioVentaSugerido).toBe(125.5);
    expect(res.body.deviceIds.sort()).toEqual([deviceIdA, deviceIdB].sort());
  });

  it('POST rechaza duplicate name (409 — UNIQUE en repuestos.repuesto)', async () => {
    const res = await request(app)
      .post('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ name: 'TEST_PIEZA_2_5' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
  });

  it('POST valida name requerido (400)', async () => {
    const res = await request(app)
      .post('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ cantidadLimite: 5 });
    expect(res.status).toBe(400);
  });

  it('POST valida precioVentaSugerido no negativo (400)', async () => {
    const res = await request(app)
      .post('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ name: 'NEGATIVE_PRICE_TEST', precioVentaSugerido: -10 });
    expect(res.status).toBe(400);
  });

  it('PATCH actualiza precio y reemplaza deviceIds cuando viene el campo', async () => {
    const created = await queryOne<{ id: number }>(
      `SELECT idrepuestos AS id FROM repuestos WHERE repuesto = 'TEST_PIEZA_2_5'`,
    );
    const res = await request(app)
      .patch(`/api/v2/repuestos/${created!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ precioVentaSugerido: 250.0, deviceIds: [deviceIdA] });
    expect(res.status).toBe(200);
    expect(res.body.precioVentaSugerido).toBe(250);
    expect(res.body.deviceIds).toEqual([deviceIdA]);

    // Verificar en DB: debería haber una sola fila en repuestosdevices
    const count = await queryOne<{ c: number }>(
      `SELECT COUNT(*) AS c FROM repuestosdevices WHERE repuestos_id = ?`,
      [created!.id],
    );
    expect(Number(count!.c)).toBe(1);
  });

  it('PATCH sin deviceIds preserva las asociaciones existentes', async () => {
    const created = await queryOne<{ id: number }>(
      `SELECT idrepuestos AS id FROM repuestos WHERE repuesto = 'TEST_PIEZA_2_5'`,
    );
    const res = await request(app)
      .patch(`/api/v2/repuestos/${created!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ cantidadLimite: 10 });
    expect(res.status).toBe(200);
    expect(res.body.cantidadLimite).toBe(10);
    expect(res.body.deviceIds).toEqual([deviceIdA]); // sigue igual
  });

  it('PATCH puede setear precioVentaSugerido a null', async () => {
    const created = await queryOne<{ id: number }>(
      `SELECT idrepuestos AS id FROM repuestos WHERE repuesto = 'TEST_PIEZA_2_5'`,
    );
    const res = await request(app)
      .patch(`/api/v2/repuestos/${created!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ precioVentaSugerido: null });
    expect(res.status).toBe(200);
    expect(res.body.precioVentaSugerido).toBeNull();
  });

  it('DELETE soft-deletea (mostrar=0) un repuesto sin stock activo', async () => {
    const created = await queryOne<{ id: number }>(
      `SELECT idrepuestos AS id FROM repuestos WHERE repuesto = 'TEST_PIEZA_2_5'`,
    );
    const delRes = await request(app)
      .delete(`/api/v2/repuestos/${created!.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(delRes.status).toBe(204);

    const dbRow = await queryOne<{ mostrar: number }>(
      `SELECT mostrar FROM repuestos WHERE idrepuestos = ?`,
      [created!.id],
    );
    expect(dbRow!.mostrar).toBe(0);

    // Ya no aparece en el listado
    const listRes = await request(app)
      .get('/api/v2/repuestos')
      .set('Authorization', `Bearer ${pruebaToken}`);
    const found = listRes.body.items.find((i: { id: number }) => i.id === created!.id);
    expect(found).toBeUndefined();
  });

  it('DELETE bloquea (409) si el repuesto tiene stock activo en alguna sucursal', async () => {
    const res = await request(app)
      .delete(`/api/v2/repuestos/${repuestoConStockId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/stock activo/);
  });

  it('non-admin GET puede leer, pero no puede crear', async () => {
    const readRes = await request(app)
      .get('/api/v2/repuestos')
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(readRes.status).toBe(200);

    const postRes = await request(app)
      .post('/api/v2/repuestos')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({ name: 'NO_DEBERIA_CREARSE' });
    expect(postRes.status).toBe(403);
  });
});
