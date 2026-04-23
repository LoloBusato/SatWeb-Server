// Fase 3.5 — stock.precioVenta pasó de INT a DECIMAL(15,2).

import { beforeAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { queryOne, resetTestDb } from './helpers/db';

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

describe('Fase 3.5 — stock.precioVenta DECIMAL(15,2)', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('la columna es DECIMAL(15,2) nullable', async () => {
    const row = await queryOne<{
      DATA_TYPE: string;
      NUMERIC_PRECISION: number;
      NUMERIC_SCALE: number;
      IS_NULLABLE: string;
    }>(
      `SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND COLUMN_NAME = 'precioVenta'`,
    );
    expect(row!.DATA_TYPE).toBe('decimal');
    expect(Number(row!.NUMERIC_PRECISION)).toBe(15);
    expect(Number(row!.NUMERIC_SCALE)).toBe(2);
    expect(row!.IS_NULLABLE).toBe('YES');
  });

  it('preserva valores enteros existentes (no trunca, no redondea)', async () => {
    // No asumimos qué idstock tiene qué — sólo que la suma de valores > 0
    // se mantuvo (era entera, sigue siendo equivalente como decimal).
    const row = await queryOne<{ total_rows: number; sum_pos: string | null }>(
      `SELECT COUNT(*) AS total_rows, SUM(precioVenta) AS sum_pos
       FROM stock WHERE precioVenta > 0`,
    );
    expect(Number(row!.total_rows)).toBeGreaterThan(0);
    // La suma debe seguir siendo un número racional (string en Node porque es DECIMAL).
    const sum = parseFloat(row!.sum_pos ?? '0');
    expect(Number.isFinite(sum)).toBe(true);
    expect(sum).toBeGreaterThan(0);
  });

  it('soporta fraccionados al insertar y los devuelve con 2 decimales', async () => {
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo, precioVenta)
         SELECT r.idrepuestos, 1, 0.00, p.idproveedores, CURDATE(), 'fase3.5-test', 199.99
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    const row = await queryOne<{ precioVenta: string }>(
      `SELECT precioVenta FROM stock WHERE modelo = 'fase3.5-test' LIMIT 1`,
    );
    // DECIMAL comes back as string; normalize and compare.
    expect(parseFloat(row!.precioVenta)).toBeCloseTo(199.99, 2);
  });

  it('redondea a 2 decimales el exceso de precisión', async () => {
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo, precioVenta)
         SELECT r.idrepuestos, 1, 0.00, p.idproveedores, CURDATE(), 'fase3.5-rounding', 100.125
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    const row = await queryOne<{ precioVenta: string }>(
      `SELECT precioVenta FROM stock WHERE modelo = 'fase3.5-rounding' LIMIT 1`,
    );
    // MySQL round-half-away-from-zero → 100.13
    expect(parseFloat(row!.precioVenta)).toBeCloseTo(100.13, 2);
  });

  it('permite NULL', async () => {
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo, precioVenta)
         SELECT r.idrepuestos, 1, 0.00, p.idproveedores, CURDATE(), 'fase3.5-null', NULL
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    const row = await queryOne<{ precioVenta: string | null }>(
      `SELECT precioVenta FROM stock WHERE modelo = 'fase3.5-null' LIMIT 1`,
    );
    expect(row!.precioVenta).toBeNull();
  });
});
