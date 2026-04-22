import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('POST /api/v2/stock-transfers', () => {
  const app = createApp();
  let pruebaToken = '';
  let nonAdminBranch1Token = '';
  let stockId = 0;
  let initialFromBranch = 0;
  let initialToBranch = 0;
  let initialFromCantBranch = 0;
  let initialFromCantRestante = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // User non-admin en branch 1 (para testear scope de fromBranchId)
    const b1User = await queryOne<{ username: string; password: string; branch_id: number }>(
      `SELECT username, password, branch_id FROM users
       WHERE deleted_at IS NULL AND username != 'prueba' AND branch_id = 1 LIMIT 1`,
    );
    if (b1User) {
      nonAdminBranch1Token = (
        await request(app)
          .post('/api/v2/auth/login')
          .send({ username: b1User.username, password: b1User.password })
      ).body.token;
    }

    // Pick un stock+branch con cantidad_restante >= 2 para poder hacer
    // transferencias sin quedarnos sin stock en el medio.
    const row = await queryOne<{
      stock_id: number;
      branch_id: number;
      cantidad_branch: number;
      cantidad_restante: number;
    }>(
      `SELECT stock_id, branch_id, cantidad_branch, cantidad_restante
       FROM stockbranch WHERE branch_id = 1 AND cantidad_restante >= 5
       ORDER BY stock_id DESC LIMIT 1`,
    );
    stockId = row!.stock_id;
    initialFromBranch = row!.branch_id;
    initialToBranch = 2; // Obelisco
    initialFromCantBranch = row!.cantidad_branch;
    initialFromCantRestante = row!.cantidad_restante;
  });

  it('transfiere 1 unidad: resta en origen, suma en destino (insert o update), crea audit row', async () => {
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        stockId,
        fromBranchId: initialFromBranch,
        toBranchId: initialToBranch,
        cantidad: 1,
        note: 'envío a lab',
      });
    expect(res.status).toBe(201);
    expect(res.body.stockId).toBe(stockId);
    expect(res.body.fromBranchId).toBe(initialFromBranch);
    expect(res.body.toBranchId).toBe(initialToBranch);
    expect(res.body.cantidad).toBe(1);
    expect(res.body.note).toBe('envío a lab');

    // Origen: cantidad_branch inalterado, cantidad_restante -1
    const srcAfter = await queryOne<{ cantidad_branch: number; cantidad_restante: number }>(
      `SELECT cantidad_branch, cantidad_restante FROM stockbranch
       WHERE stock_id = ? AND branch_id = ?`,
      [stockId, initialFromBranch],
    );
    expect(srcAfter!.cantidad_branch).toBe(initialFromCantBranch);
    expect(srcAfter!.cantidad_restante).toBe(initialFromCantRestante - 1);

    // Destino: existe con cantidad_branch y cantidad_restante >= 1
    const destAfter = await queryOne<{ cantidad_branch: number; cantidad_restante: number }>(
      `SELECT cantidad_branch, cantidad_restante FROM stockbranch
       WHERE stock_id = ? AND branch_id = ?`,
      [stockId, initialToBranch],
    );
    expect(destAfter).not.toBeNull();
    expect(destAfter!.cantidad_restante).toBeGreaterThanOrEqual(1);
  });

  it('rechaza cantidad > cantidad_restante (409 insuficiente)', async () => {
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        stockId,
        fromBranchId: initialFromBranch,
        toBranchId: initialToBranch,
        cantidad: 999999,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/insuficiente/i);
  });

  it('rechaza fromBranchId == toBranchId (409)', async () => {
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        stockId,
        fromBranchId: 1,
        toBranchId: 1,
        cantidad: 1,
      });
    expect(res.status).toBe(409);
  });

  it('rechaza toBranchId inexistente (409)', async () => {
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        stockId,
        fromBranchId: initialFromBranch,
        toBranchId: 999999,
        cantidad: 1,
      });
    expect(res.status).toBe(409);
  });

  it('rechaza stockId sin stockbranch en el origen (409)', async () => {
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        stockId: 999999,
        fromBranchId: initialFromBranch,
        toBranchId: initialToBranch,
        cantidad: 1,
      });
    expect(res.status).toBe(409);
  });

  it('user non-admin NO puede transferir desde una sucursal que no es la suya (403)', async () => {
    if (!nonAdminBranch1Token) return;
    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${nonAdminBranch1Token}`)
      .send({
        stockId,
        fromBranchId: 2, // usuario es de branch 1
        toBranchId: 1,
        cantidad: 1,
      });
    expect(res.status).toBe(403);
  });

  it('user non-admin SÍ puede transferir desde su propia sucursal', async () => {
    if (!nonAdminBranch1Token) return;
    // Verificar que aún queda stock suficiente después del test 1
    const before = await queryOne<{ cantidad_restante: number }>(
      `SELECT cantidad_restante FROM stockbranch WHERE stock_id = ? AND branch_id = 1`,
      [stockId],
    );
    if (!before || before.cantidad_restante < 1) return;

    const res = await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${nonAdminBranch1Token}`)
      .send({
        stockId,
        fromBranchId: 1,
        toBranchId: 2,
        cantidad: 1,
      });
    expect(res.status).toBe(201);
  });
});

describe('GET /api/v2/stock-transfers', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;
  let stockId = 0;

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

    const row = await queryOne<{ stock_id: number }>(
      `SELECT stock_id FROM stockbranch WHERE branch_id = 1 AND cantidad_restante >= 5
       ORDER BY stock_id DESC LIMIT 1`,
    );
    stockId = row!.stock_id;

    // Crear dos transferencias para tener data en la lista
    await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stockId, fromBranchId: 1, toBranchId: otherBranchId, cantidad: 1, note: 'a destino' });
    await request(app)
      .post('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({ stockId, fromBranchId: otherBranchId, toBranchId: 1, cantidad: 1, note: 'volvió' });
  });

  it('user de branch destino ve ambas transferencias (OR from/to)', async () => {
    const res = await request(app)
      .get('/api/v2/stock-transfers')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    const forStock = res.body.items.filter((i: { stockId: number }) => i.stockId === stockId);
    expect(forStock.length).toBeGreaterThanOrEqual(2);
  });

  it('filtro ?stockId=<id> reduce a transferencias de ese stock', async () => {
    const res = await request(app)
      .get(`/api/v2/stock-transfers?stockId=${stockId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.stockId).toBe(stockId);
    }
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    // El más reciente va primero (order by transferred_at DESC)
    expect(res.body.items[0].note).toBe('volvió');
    expect(res.body.items[1].note).toBe('a destino');
    expect(res.body.items[0].repuestoName).toBeDefined();
    expect(res.body.items[0].fromBranchName).toBeDefined();
    expect(res.body.items[0].transferredByUsername).toBe('prueba');
  });
});
