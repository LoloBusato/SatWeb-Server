import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('GET /api/v2/stock/:stockId/distribution', () => {
  const app = createApp();
  let token = '';
  let stockWithMultipleBranches = 0;
  let stockWithSingleBranch = 0;

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    token = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    // stock con filas en ≥2 sucursales
    const multi = await queryOne<{ stock_id: number }>(
      `SELECT stock_id FROM stockbranch
       GROUP BY stock_id HAVING COUNT(*) >= 2
       ORDER BY stock_id DESC LIMIT 1`,
    );
    stockWithMultipleBranches = multi!.stock_id;

    const single = await queryOne<{ stock_id: number }>(
      `SELECT stock_id FROM stockbranch
       GROUP BY stock_id HAVING COUNT(*) = 1
       ORDER BY stock_id DESC LIMIT 1`,
    );
    stockWithSingleBranch = single!.stock_id;
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get(
      `/api/v2/stock/${stockWithMultipleBranches}/distribution`,
    );
    expect(res.status).toBe(401);
  });

  it('returns the distribution with repuesto name and branch rows', async () => {
    const res = await request(app)
      .get(`/api/v2/stock/${stockWithMultipleBranches}/distribution`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stockId).toBe(stockWithMultipleBranches);
    expect(typeof res.body.repuestoName).toBe('string');
    expect(Array.isArray(res.body.distribution)).toBe(true);
    expect(res.body.distribution.length).toBeGreaterThanOrEqual(2);
    const sample = res.body.distribution[0];
    expect(sample).toHaveProperty('branchId');
    expect(sample).toHaveProperty('branchName');
    expect(sample).toHaveProperty('cantidadBranch');
    expect(sample).toHaveProperty('cantidadRestante');
    // Ordenado por branchId ascendente
    for (let i = 1; i < res.body.distribution.length; i++) {
      expect(res.body.distribution[i].branchId).toBeGreaterThanOrEqual(
        res.body.distribution[i - 1].branchId,
      );
    }
  });

  it('returns a single-branch stock with exactly one distribution row', async () => {
    const res = await request(app)
      .get(`/api/v2/stock/${stockWithSingleBranch}/distribution`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.distribution.length).toBe(1);
  });

  it('returns 404 for non-existent stockId', async () => {
    const res = await request(app)
      .get('/api/v2/stock/99999999/distribution')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});
