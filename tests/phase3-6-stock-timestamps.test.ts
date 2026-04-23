// Fase 3.6 — stock.created_at + stock.updated_at con auto-management de MySQL.

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

interface ColumnRow {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
}

describe('Fase 3.6 — stock.created_at / updated_at', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('ambas columnas son DATETIME NOT NULL con defaults automáticos', async () => {
    const createdAt = await queryOne<ColumnRow>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND COLUMN_NAME = 'created_at'`,
    );
    expect(createdAt!.DATA_TYPE).toBe('datetime');
    expect(createdAt!.IS_NULLABLE).toBe('NO');
    expect(createdAt!.COLUMN_DEFAULT).toBe('CURRENT_TIMESTAMP');
    expect(createdAt!.EXTRA).toBe('DEFAULT_GENERATED');

    const updatedAt = await queryOne<ColumnRow>(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND COLUMN_NAME = 'updated_at'`,
    );
    expect(updatedAt!.DATA_TYPE).toBe('datetime');
    expect(updatedAt!.IS_NULLABLE).toBe('NO');
    expect(updatedAt!.COLUMN_DEFAULT).toBe('CURRENT_TIMESTAMP');
    // ON UPDATE CURRENT_TIMESTAMP se expresa en EXTRA
    expect(updatedAt!.EXTRA).toContain('on update CURRENT_TIMESTAMP');
  });

  it('backfill: filas preexistentes tienen created_at = fecha_compra', async () => {
    const row = await queryOne<{ mismatch: number }>(
      `SELECT COUNT(*) AS mismatch FROM stock WHERE DATE(created_at) <> fecha_compra`,
    );
    // Algunas filas pueden haber sido tocadas por tests previos pero
    // en el reset fresh deberían matchear al 100%.
    expect(Number(row!.mismatch)).toBe(0);
  });

  it('fecha_compra NO se perdió — sigue siendo DATE NOT NULL', async () => {
    const row = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock' AND COLUMN_NAME = 'fecha_compra'`,
    );
    expect(row!.DATA_TYPE).toBe('date');
    expect(row!.IS_NULLABLE).toBe('NO');
  });

  it('INSERT sin pasar created_at/updated_at los setea automáticamente', async () => {
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo)
         SELECT r.idrepuestos, 1, 0.00, p.idproveedores, '2020-01-01', 'fase3.6-auto'
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    // Comparamos contra NOW() del servidor MySQL, no Date.now(), para evitar
    // el drift de timezone entre Node y la DB (DATETIME no guarda tz).
    const row = await queryOne<{
      seconds_since_created: number;
      seconds_since_updated: number;
      fecha_compra_str: string;
    }>(
      `SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS seconds_since_created,
              TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS seconds_since_updated,
              DATE_FORMAT(fecha_compra, '%Y-%m-%d') AS fecha_compra_str
       FROM stock WHERE modelo = 'fase3.6-auto' LIMIT 1`,
    );
    expect(Math.abs(Number(row!.seconds_since_created))).toBeLessThan(60);
    expect(Math.abs(Number(row!.seconds_since_updated))).toBeLessThan(60);
    // fecha_compra sigue siendo la del INSERT (no el default)
    expect(row!.fecha_compra_str).toBe('2020-01-01');
  });

  it('UPDATE auto-bumpea updated_at pero no created_at', async () => {
    // Setup: insertar y tomar timestamps iniciales
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock
           (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, modelo)
         SELECT r.idrepuestos, 5, 10.00, p.idproveedores, '2024-06-15', 'fase3.6-update'
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });

    const before = await queryOne<{ created_at: string; updated_at: string; idstock: number }>(
      `SELECT idstock, created_at, updated_at FROM stock WHERE modelo = 'fase3.6-update' LIMIT 1`,
    );

    // Esperamos 1.1s para que el bump sea detectable (DATETIME sin fractional seconds).
    await new Promise((r) => setTimeout(r, 1100));

    await withConn(async (conn) => {
      await conn.query(`UPDATE stock SET cantidad = 9 WHERE idstock = ?`, [before!.idstock]);
    });

    const after = await queryOne<{ created_at: string; updated_at: string }>(
      `SELECT created_at, updated_at FROM stock WHERE idstock = ?`,
      [before!.idstock],
    );

    expect(new Date(after!.created_at).getTime()).toBe(new Date(before!.created_at).getTime());
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });

  it('legacy-shape INSERT (sin created_at/updated_at) sigue funcionando', async () => {
    // Replica el INSERT del legacy (CRUD/stock.js línea 18) agregando modelo=''
    // porque modelo es NOT NULL sin default y el legacy lo pasa como string
    // vacío cuando el body del request no lo trae. Strict mode en MySQL 8
    // obliga a pasarlo aunque sea vacío — es una deuda pre-existente de la
    // tabla, no del cambio de Fase 3.6.
    await withConn(async (conn) => {
      await conn.query(
        `INSERT INTO stock (repuesto_id, cantidad, precio_compra, proveedor_id, fecha_compra, cantidad_limite, branch_id, modelo)
         SELECT r.idrepuestos, 3, 50.00, p.idproveedores, CURDATE(), 10, 1, ''
         FROM repuestos r, proveedores p LIMIT 1`,
      );
    });
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM stock WHERE cantidad = 3 AND precio_compra = 50.00 AND branch_id = 1`,
    );
    expect(Number(row!.cnt)).toBeGreaterThanOrEqual(1);
  });
});
