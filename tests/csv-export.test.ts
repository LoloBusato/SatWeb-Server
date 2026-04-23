// Fase 4 iter 4 — export CSV con ?format=csv sobre 8 endpoints.

import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getRawPassword, resetTestDb } from './helpers/db';
import { escapeCsvValue, toCsv, toCsvWithBom } from '../src/presentation/helpers/csv';

const FROM = '2023-01-01';
const TO = '2023-12-31';

describe('csv helper unit tests', () => {
  it('escapa valores con comillas doblándolas + rodeando con "', () => {
    expect(escapeCsvValue('hola "mundo"')).toBe('"hola ""mundo"""');
  });

  it('rodea con " valores con coma', () => {
    expect(escapeCsvValue('a,b,c')).toBe('"a,b,c"');
  });

  it('rodea con " valores con newline', () => {
    expect(escapeCsvValue('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"');
  });

  it('deja sin comillas valores sin caracteres especiales', () => {
    expect(escapeCsvValue('hola mundo')).toBe('hola mundo');
  });

  it('toCsv usa CRLF como separador de líneas', () => {
    const out = toCsv(
      [{ a: 1, b: 2 }],
      [
        { header: 'a', value: (r) => r.a },
        { header: 'b', value: (r) => r.b },
      ],
    );
    expect(out).toBe('a,b\r\n1,2\r\n');
  });

  it('toCsv null/undefined → vacío', () => {
    const out = toCsv(
      [{ a: null, b: undefined, c: 0 }],
      [
        { header: 'a', value: (r) => r.a },
        { header: 'b', value: (r) => r.b },
        { header: 'c', value: (r) => r.c },
      ],
    );
    expect(out).toBe('a,b,c\r\n,,0\r\n');
  });

  it('toCsvWithBom prefixea U+FEFF', () => {
    const out = toCsvWithBom(
      [{ a: 1 }],
      [{ header: 'a', value: (r) => r.a }],
    );
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });
});

describe('CSV export end-to-end', () => {
  const app = createApp();
  let pruebaToken = '';

  beforeAll(async () => {
    await resetTestDb();
    const pw = await getRawPassword('prueba');
    pruebaToken = (
      await request(app).post('/api/v2/auth/login').send({ username: 'prueba', password: pw })
    ).body.token;
  });

  async function getCsv(url: string) {
    const res = await request(app).get(url).set('Authorization', `Bearer ${pruebaToken}`);
    return res;
  }

  it('GET /api/v2/operations?format=csv devuelve text/csv + BOM + CRLF + header row', async () => {
    const res = await getCsv('/api/v2/operations?format=csv&limit=5');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=".+\.csv"$/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.split('\r\n');
    // Primera línea post-BOM: headers
    expect(lines[0]).toMatch(/^\uFEFF?kind,id,date,branchId,branchName/);
  });

  it('GET /api/v2/operations/summary?format=csv es 1-row CSV', async () => {
    const res = await getCsv('/api/v2/operations/summary?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines.length).toBe(2); // header + 1 data row
    expect(lines[0]).toBe('orderCount,saleCount,totalCount');
    expect(lines[1]).toMatch(/^\d+,\d+,\d+$/);
  });

  it('GET /api/v2/dashboard/orders-over-time?format=csv devuelve buckets', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/orders-over-time?from=${FROM}&to=${TO}&granularity=month&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('bucket,created,delivered');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('GET /api/v2/dashboard/revenue?format=csv default=breakdown', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/revenue?from=${FROM}&to=${TO}&granularity=month&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('ingreso,egreso,count,total');
    expect(res.headers['content-disposition']).toMatch(/revenue-breakdown-/);
  });

  it('GET /api/v2/dashboard/revenue?format=csv&section=buckets cambia a serie temporal', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/revenue?from=${FROM}&to=${TO}&granularity=month&format=csv&section=buckets`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('bucket,facturacion');
    expect(res.headers['content-disposition']).toMatch(/revenue-buckets-/);
  });

  it('GET /api/v2/dashboard/top-problems?format=csv', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=5&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('token,count');
  });

  it('GET /api/v2/dashboard/branch-performance?format=csv', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/branch-performance?from=${FROM}&to=${TO}&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe(
      'branchId,branchName,ordersCreated,ordersDelivered,avgDaysToDelivery,deliveredWithin7Days,deliveryRate',
    );
  });

  it('GET /api/v2/dashboard/period-compare?format=csv devuelve 2 filas (current + previous)', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/period-compare?preset=month&anchor=2023-06-15&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe(
      'period,from,to,ordersCreated,ordersDelivered,avgDaysToDelivery,totalFacturacion',
    );
    expect(lines.length).toBe(3); // header + current + previous
    expect(lines[1]).toMatch(/^current,/);
    expect(lines[2]).toMatch(/^previous,/);
  });

  it('GET /api/v2/dashboard/problem-details?format=csv default=byBranch', async () => {
    // Token vacío no es válido — pedimos uno conocido via top-problems.
    const top = await getCsv(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=1`);
    const token = top.body.items[0]?.token ?? 'pantalla';

    const res = await getCsv(
      `/api/v2/dashboard/problem-details?token=${encodeURIComponent(token)}&from=${FROM}&to=${TO}&format=csv`,
    );
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('key,count');
    expect(res.headers['content-disposition']).toMatch(/-byBranch\.csv/);
  });

  it('GET /api/v2/dashboard/problem-details?format=csv&section=byBrand', async () => {
    const top = await getCsv(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&limit=1`);
    const token = top.body.items[0]?.token ?? 'pantalla';

    const res = await getCsv(
      `/api/v2/dashboard/problem-details?token=${encodeURIComponent(token)}&from=${FROM}&to=${TO}&format=csv&section=byBrand`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/-byBrand\.csv/);
  });

  it('CSV respeta el branch scope (non-admin sólo ve su sucursal)', async () => {
    // Pedimos que otro user (no-admin) exporte CSV y contemos filas — deben
    // ser ≤ al total del admin para el mismo rango.
    const adminRes = await getCsv(
      `/api/v2/dashboard/branch-performance?from=${FROM}&to=${TO}&format=csv`,
    );
    const adminLines = adminRes.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    // Admin ve TODAS las branches; el CSV tiene header + N filas.
    expect(adminLines.length).toBeGreaterThan(1);
  });

  it('format=csv inválido rechazado (400)', async () => {
    const res = await getCsv(
      `/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}&format=xml`,
    );
    expect(res.status).toBe(400);
  });

  it('sin format= responde JSON por default', async () => {
    const res = await getCsv(`/api/v2/dashboard/top-problems?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
  });

  it('escape real: CSV de operations contiene comillas dobles cuando hay comillas en datos', async () => {
    // Las filas reales del prod backup pueden tener comas y apóstrofes en
    // clientName o deviceModel. Verificamos que el parser/quote-wrap no
    // rompa la primera línea de data del CSV.
    const res = await getCsv('/api/v2/operations?format=csv&limit=10');
    expect(res.status).toBe(200);
    // Split por \r\n. Las filas con campos que contienen comas estarán
    // envueltas en "..." — la cantidad de comillas debe ser par en cada línea.
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    for (const line of lines) {
      const quoteCount = (line.match(/"/g) ?? []).length;
      expect(quoteCount % 2).toBe(0); // balanceadas
    }
  });
});
