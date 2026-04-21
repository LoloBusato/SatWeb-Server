import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, queryOne, resetTestDb } from './helpers/db';

describe('POST /api/v2/auth/login', () => {
  const app = createApp();

  beforeAll(async () => {
    await resetTestDb();
  });

  it('returns 400 when the body is empty', async () => {
    const res = await request(app).post('/api/v2/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'username' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    );
  });

  it('returns 401 for an unknown user', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: '__missing__', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('returns 401 when the password is wrong', async () => {
    const res = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: '__nope__' });
    expect(res.status).toBe(401);
  });

  it('migrates a legacy plaintext password to bcrypt on first successful login', async () => {
    const plaintext = await getRawPassword('prueba');
    expect(plaintext).not.toBeNull();
    expect(plaintext!.length).toBeLessThan(60);

    const res1 = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: plaintext });
    expect(res1.status).toBe(200);
    expect(typeof res1.body.token).toBe('string');
    expect(res1.body.user.username).toBe('prueba');
    expect(res1.body.permissions).toContain('branches:view_all');

    const storedAfter = await getRawPassword('prueba');
    expect(storedAfter).toHaveLength(60);
    expect(storedAfter!.startsWith('$2')).toBe(true);

    const res2 = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: plaintext });
    expect(res2.status).toBe(200);
    expect(typeof res2.body.token).toBe('string');
  });
});

describe('GET /api/v2/auth/me', () => {
  const app = createApp();

  beforeAll(async () => {
    await resetTestDb();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v2/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('returns 401 with a bogus token', async () => {
    const res = await request(app)
      .get('/api/v2/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('returns user and permissions with a valid token', async () => {
    const plaintext = await getRawPassword('prueba');
    const loginRes = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: plaintext });
    const token = loginRes.body.token;

    const res = await request(app)
      .get('/api/v2/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('prueba');
    expect(res.body.permissions).toContain('branches:view_all');
    expect(res.body.permissions).toContain('users:manage');
  });
});

describe('soft-deleted users can\'t log in', () => {
  const app = createApp();

  beforeAll(async () => {
    await resetTestDb();
  });

  it('blocks login after the user is soft-deleted', async () => {
    // Login as prueba, create a throwaway user, soft-delete it, then try to login as the throwaway.
    const pruebaPw = await getRawPassword('prueba');
    const pruebaLogin = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'prueba', password: pruebaPw });
    const pruebaToken = pruebaLogin.body.token;

    const createRes = await request(app)
      .post('/api/v2/users')
      .set('Authorization', `Bearer ${pruebaToken}`)
      .send({
        username: 'TEST_SOFT_DEL',
        password: 'password1234',
        groupId: 29,
        branchId: 1,
      });
    expect(createRes.status).toBe(201);
    const newUserId = createRes.body.id;

    const okLogin = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'TEST_SOFT_DEL', password: 'password1234' });
    expect(okLogin.status).toBe(200);

    const delRes = await request(app)
      .delete(`/api/v2/users/${newUserId}`)
      .set('Authorization', `Bearer ${pruebaToken}`);
    expect(delRes.status).toBe(204);

    const deniedLogin = await request(app)
      .post('/api/v2/auth/login')
      .send({ username: 'TEST_SOFT_DEL', password: 'password1234' });
    expect(deniedLogin.status).toBe(401);
    expect(deniedLogin.body.error.code).toBe('invalid_credentials');

    const row = await queryOne<{ deleted_at: unknown }>(
      'SELECT deleted_at FROM users WHERE idusers = ?',
      [newUserId],
    );
    expect(row!.deleted_at).not.toBeNull();
  });
});
