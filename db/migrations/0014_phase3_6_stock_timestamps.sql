-- 0014_phase3_6_stock_timestamps.sql
-- Fase 3.6 — timestamps sistemáticos en `stock`: agregar created_at y
-- updated_at sin tocar `fecha_compra` (son semánticas distintas):
--   - fecha_compra: cuándo se hizo la compra física del ítem (user input).
--   - created_at: cuándo se insertó la fila en la DB (audit DB).
--   - updated_at: cuándo se tocó la fila por última vez (auto-bumpeable).
--
-- Tres pasos:
--   1. Agregar columnas nullable para permitir backfill sin strict-mode
--      rechazando las filas existentes.
--   2. Backfill con fecha_compra (mejor proxy disponible — las 3488 filas
--      tienen fecha_compra NOT NULL con valores entre 2022-10-03 y hoy).
--   3. Tighten: NOT NULL + DEFAULT CURRENT_TIMESTAMP + ON UPDATE
--      CURRENT_TIMESTAMP. A partir de ahora MySQL maneja todo automático
--      en INSERT y UPDATE — el legacy CRUD/stock.js no necesita cambio
--      porque no menciona estas columnas en sus INSERT/UPDATE.
--
-- Rollback:
--   ALTER TABLE stock DROP COLUMN updated_at;
--   ALTER TABLE stock DROP COLUMN created_at;

-- 1. Columnas nullable para backfill
ALTER TABLE stock
  ADD COLUMN created_at DATETIME NULL AFTER precioVenta,
  ADD COLUMN updated_at DATETIME NULL AFTER created_at;

-- 2. Backfill desde fecha_compra (todas las filas, ambas columnas iguales
--    porque no hay historial de modificaciones anterior).
UPDATE stock
  SET created_at = fecha_compra,
      updated_at = fecha_compra
  WHERE created_at IS NULL;

-- 3. Tighten + auto-management
ALTER TABLE stock
  MODIFY COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
