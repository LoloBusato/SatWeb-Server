import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('GET /api/v2/orders — multi-tenancy', () => {
  const app = createApp();
  let pruebaToken = '';
  let otherToken = '';
  let otherBranchId = 0;
  let otherUsername = '';

  beforeAll(async () => {
    await resetTestDb();

    const pruebaPw = await getRawPassword('prueba');
    const loginPrueba = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: pruebaPw });
    pruebaToken = loginPrueba.body.token;

    const otherRow = await queryOne<{ username: string; branch_id: number; password: string }>(
      `SELECT username, branch_id, password
       FROM users
       WHERE deleted_at IS NULL AND username != 'prueba' AND branch_id != 1
       LIMIT 1`,
    );
    otherUsername = otherRow!.username;
    otherBranchId = Number(otherRow!.branch_id);

    const loginOther = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: otherUsername, password: otherRow!.password });
    otherToken = loginOther.body.token;
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v2/orders');
    expect(res.status).toBe(401);
  });

  it('scopes a regular user to their own branch', async () => {
    const res = await request(app)
      .get('/api/v2/orders?limit=200')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBe(otherBranchId);
    for (const item of res.body.items) {
      expect(item.branchId).toBe(otherBranchId);
    }
  });

  it('lets a user with branches:view_all see orders across all branches', async () => {
    // offset=3000 guarantees the result spans more than one branch given the
    // data distribution (Belgrano has 7296 orders, Obelisco 2080).
    const res = await request(app)
      .get('/api/v2/orders?limit=200&offset=3000')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branchFilter).toBeNull();
    const branches = new Set(res.body.items.map((i: { branchId: number }) => i.branchId));
    expect(branches.size).toBeGreaterThan(1);
  });

  it('filters by delivered=true (all results have returnedAt)', async () => {
    const res = await request(app)
      .get('/api/v2/orders?limit=50&delivered=true')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(item.returnedAt).not.toBeNull();
    }
  });
});
