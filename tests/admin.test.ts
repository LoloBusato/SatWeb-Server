import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('authorization — :manage permissions', () => {
  const app = createApp();
  let pruebaToken = '';
  let nonAdminToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;

    const nonAdminRow = await queryOne<{ username: string; password: string }>(
      `SELECT username, password
       FROM users
       WHERE deleted_at IS NULL AND username != 'prueba'
       LIMIT 1`,
    );
    nonAdminToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: nonAdminRow!.username, password: nonAdminRow!.password })
    ).body.token;
  });

  it('rejects a non-admin user trying to list /users (403)', async () => {
    const res = await request(app)
      .get('/api/v2/users')
      .set('Authorization', `Bearer ${nonAdminToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('rejects a non-admin user trying to POST /users (403)', async () => {
    const res = await request(app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({
        username: 'should_fail',
        password: 'password1234',
        groupId: 29,
        branchId: 1,
      });
    expect(res.status).toBe(403);
  });

  it('allows prueba (admin) to list /users', async () => {
    const res = await request(app)
      .get('/api/v2/users')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const u of res.body.items) {
      expect(u).not.toHaveProperty('passwordHash');
    }
  });
});

describe('integrity guards on soft-delete', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pruebaPw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app)
        .post('/api/v2/auth/login')
        .send({ username: 'prueba', password: pruebaPw })
    ).body.token;
  });

  it('blocks soft-deleting a state that is in use by active orders (409)', async () => {
    const busyStateRow = await queryOne<{ idstates: number }>(
      `SELECT s.idstates
       FROM states s
       JOIN orders o ON o.state_id = s.idstates AND o.returned_at IS NULL
       WHERE s.deleted_at IS NULL
       GROUP BY s.idstates
       ORDER BY COUNT(o.order_id) DESC
       LIMIT 1`,
    );
    const busyId = Number(busyStateRow!.idstates);

    const res = await request(app)
      .delete(`/api/v2/states/${busyId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('conflict');
    expect(res.body.error.message).toMatch(/orden.*activa/);
  });

  it('blocks soft-deleting a branch with active users (409)', async () => {
    const res = await request(app)
      .delete('/api/v2/branches/1')
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/usuario\(s\) activo\(s\)/);
  });

  it('blocks soft-deleting the last admin user (409) and preserves prueba', async () => {
    const pruebaRow = await queryOne<{ idusers: number }>(
      `SELECT idusers FROM users WHERE username = 'prueba'`,
    );
    const pruebaId = Number(pruebaRow!.idusers);

    // Create a second admin, then soft-delete them, then try to delete prueba.
    const second = await request(app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        username: 'SECOND_ADMIN',
        password: 'password1234',
        groupId: 29,
        branchId: 1,
      });
    expect(second.status).toBe(201);

    const removeSecond = await request(app)
      .delete(`/api/v2/users/${second.body.id}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(removeSecond.status).toBe(204);

    const deletePrueba = await request(app)
      .delete(`/api/v2/users/${pruebaId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(deletePrueba.status).toBe(409);
    expect(deletePrueba.body.error.message).toMatch(/único usuario activo/);

    const row = await queryOne<{ deleted_at: unknown }>(
      `SELECT deleted_at FROM users WHERE idusers = ?`,
      [pruebaId],
    );
    expect(row!.deleted_at).toBeNull();
  });
});

describe('permission revocation propagates', () => {
  const app = createApp();

  beforeAll(async () => {
    await resetTestDb();
  });

  it('removes branches:view_all from prueba\'s group and the next login filters by branch', async () => {
    const pruebaPw = await getRawPassword('prueba');
    const pruebaLogin = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: pruebaPw });
    const adminToken = pruebaLogin.body.token;

    // Find permission ids we want to KEEP (everything except branches:view_all).
    const perms = await request(app)
      .get('/api/v2/permissions')
      .set('Authorization', `Bearer ${adminToken}`);
    const keepIds: number[] = perms.body.items
      .filter((p: { code: string }) => p.code !== 'branches:view_all')
      .map((p: { id: number }) => p.id);

    const putRes = await request(app)
      .put('/api/v2/groups/29/permissions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissionIds: keepIds });
    expect(putRes.status).toBe(200);
    expect(putRes.body.items.map((p: { code: string }) => p.code)).not.toContain(
      'branches:view_all',
    );

    // Re-login → new JWT without view_all.
    const loginAgain = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: pruebaPw });
    expect(loginAgain.body.permissions).not.toContain('branches:view_all');
    const newToken = loginAgain.body.token;

    const ordersRes = await request(app)
      .get('/api/v2/orders?limit=50&offset=3000')
      .set('Authorization', `Bearer ${newToken}`);
    expect(ordersRes.body.branchFilter).toBe(1); // prueba's own branch
    for (const item of ordersRes.body.items) {
      expect(item.branchId).toBe(1);
    }
  });
});
