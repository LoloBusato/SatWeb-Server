-- 0017_phase3_4_close_drop_varchars.sql
-- Paso 3 (final) del cierre de Fase 3.4 — dropea las columnas VARCHAR legacy
-- de fechas, dropea los triggers dual-write, y renombra las columnas _dt al
-- nombre original. Coordinado con un deploy de código que patchea tanto el
-- legacy CRUD (CRUD/orders.js, CRUD/messages.js, CRUD/reduceStock.js,
-- CRUD/movname.js) como el v2 (Drizzle schema + OrderRepository.updateState)
-- para que todos los writes manden DATETIME-compatibles (CONVERT_TZ(NOW(),
-- '+00:00', '-03:00') para timestamps server-side, STR_TO_DATE para fechas
-- que manda el cliente en movesSells/movesRepairs).
--
-- La convención del schema sigue siendo AR-local wall-clock en DATETIME sin
-- tz metadata — el frontend helper (SatWeb-Client dateFormat.js) extrae las
-- partes literales del ISO que emite mysql2.
--
-- Orden: triggers primero (para no intentar rellenar columnas que estamos
-- por droppear), después el ALTER combinado por tabla.
--
-- Rollback manual (no reversible sin perder los dual-write y el VARCHAR
-- original; sólo queda re-agregar una VARCHAR y backfillear desde el
-- DATETIME):
--   ALTER TABLE messages RENAME COLUMN created_at TO created_at_dt,
--     ADD COLUMN created_at VARCHAR(45);
--   UPDATE messages SET created_at = DATE_FORMAT(created_at_dt, '%e/%c/%Y %k:%i:%s');
--   -- idem orders (created_at + returned_at) y reducestock.date.

DROP TRIGGER IF EXISTS messages_created_at_dual_write;
DROP TRIGGER IF EXISTS orders_dates_before_insert;
DROP TRIGGER IF EXISTS orders_dates_before_update;
DROP TRIGGER IF EXISTS reducestock_date_before_insert;

ALTER TABLE messages
  DROP COLUMN created_at,
  RENAME COLUMN created_at_dt TO created_at;

ALTER TABLE orders
  DROP COLUMN created_at,
  DROP COLUMN returned_at,
  RENAME COLUMN created_at_dt TO created_at,
  RENAME COLUMN returned_at_dt TO returned_at;

ALTER TABLE reducestock
  DROP COLUMN `date`,
  RENAME COLUMN date_dt TO `date`;
