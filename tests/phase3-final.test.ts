// Paso 3 final de cierre de Fase 3.4 — verifica que el schema post-migración
// 0017 quedó limpio: triggers dropeados, VARCHARs dropeados, _dt renombrados.

import { beforeAll, describe, expect, it } from 'vitest';
import { queryOne, resetTestDb } from './helpers/db';

describe('Fase 3 cierre — schema post-drop', () => {
  beforeAll(async () => {
    await resetTestDb();
  });

  it('messages.created_at es DATETIME (renombrado desde _dt)', async () => {
    const row = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'created_at'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('NO');
  });

  it('orders.created_at y orders.returned_at son DATETIME', async () => {
    const created = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'created_at'`,
    );
    expect(created!.DATA_TYPE).toBe('datetime');
    expect(created!.IS_NULLABLE).toBe('NO');

    const returned = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'returned_at'`,
    );
    expect(returned!.DATA_TYPE).toBe('datetime');
    expect(returned!.IS_NULLABLE).toBe('YES');
  });

  it('reducestock.date es DATETIME', async () => {
    const row = await queryOne<{ DATA_TYPE: string; IS_NULLABLE: string }>(
      `SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reducestock' AND COLUMN_NAME = 'date'`,
    );
    expect(row!.DATA_TYPE).toBe('datetime');
    expect(row!.IS_NULLABLE).toBe('NO');
  });

  it('no quedan columnas *_dt legacy', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME LIKE '%_dt'`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('no quedan triggers dual-write', async () => {
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.TRIGGERS
       WHERE EVENT_OBJECT_SCHEMA = DATABASE()
         AND TRIGGER_NAME IN (
           'messages_created_at_dual_write',
           'orders_dates_before_insert',
           'orders_dates_before_update',
           'reducestock_date_before_insert'
         )`,
    );
    expect(Number(row!.cnt)).toBe(0);
  });

  it('data de prod backfilled se mantiene (orden más reciente tiene created_at no-NULL)', async () => {
    const row = await queryOne<{ oldest: string; newest: string; cnt: number }>(
      `SELECT COUNT(*) AS cnt, MIN(created_at) AS oldest, MAX(created_at) AS newest FROM orders`,
    );
    expect(Number(row!.cnt)).toBeGreaterThan(0);
    expect(row!.oldest).toBeTruthy();
    expect(row!.newest).toBeTruthy();
  });
});
