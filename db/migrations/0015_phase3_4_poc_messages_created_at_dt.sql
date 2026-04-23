-- 0015_phase3_4_poc_messages_created_at_dt.sql
-- Fase 3.4 — PoC del patrón dual-write para migrar fechas VARCHAR → DATETIME.
--
-- Elegido `messages.created_at` como primer target porque:
--   - Formato 100% canónico en prod (27087 rows parsean con '%d/%m/%Y %H:%i:%s',
--     cero casos raros).
--   - Escritor único (CRUD/messages.js, formato dd/mm/yyyy HH:MM:SS).
--   - Reader principal lo ordena con STR_TO_DATE — la DATETIME lo hace trivial.
--   - Sin triggers preexistentes.
--
-- Estrategia dual-write (zero-downtime):
--   1. Agregar columna `created_at_dt DATETIME` (nullable para backfill).
--   2. Backfill desde VARCHAR.
--   3. Tighten a NOT NULL con DEFAULT CURRENT_TIMESTAMP (safety net por si
--      algún INSERT futuro no lanza el trigger).
--   4. Instalar trigger BEFORE INSERT que parsea el VARCHAR y setea la
--      DATETIME. Legacy no necesita cambio: sigue mandando VARCHAR al
--      INSERT y MySQL auto-fillea la DATETIME.
--
-- El VARCHAR `created_at` queda intacto: lo usa el legacy y no se puede
-- droppear hasta que muera. Cuando eso pase, una migration futura hará
-- `DROP COLUMN created_at; RENAME created_at_dt TO created_at;` y se cierra
-- la deuda técnica.
--
-- Patrón validado acá: si funciona bien en prod, se replica para
-- `orders.created_at`, `orders.returned_at`, `reducestock.date`.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS messages_created_at_dual_write;
--   ALTER TABLE messages DROP COLUMN created_at_dt;

-- 1. Columna nueva nullable para backfill
ALTER TABLE messages ADD COLUMN created_at_dt DATETIME NULL AFTER created_at;

-- 2. Backfill — el chequeo confirmó 100% parseable
UPDATE messages
  SET created_at_dt = STR_TO_DATE(created_at, '%d/%m/%Y %H:%i:%s');

-- 3. Tighten
ALTER TABLE messages
  MODIFY COLUMN created_at_dt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Trigger dual-write
--    Pre-filtra con REGEXP antes de STR_TO_DATE porque strict mode de MySQL 8
--    rechaza STR_TO_DATE('basura', fmt) con error "Incorrect datetime value"
--    incluso dentro de un IFNULL. El IF(REGEXP, val, NULL) evita que
--    STR_TO_DATE vea el input inválido — si el REGEXP no matchea pasa NULL
--    y STR_TO_DATE(NULL, fmt) devuelve NULL limpiamente (mismo patrón
--    que usó la migration 0010 para el seed de order_state_history).
DROP TRIGGER IF EXISTS messages_created_at_dual_write;

CREATE TRIGGER messages_created_at_dual_write
  BEFORE INSERT ON messages
  FOR EACH ROW
  SET NEW.created_at_dt = IFNULL(
    STR_TO_DATE(
      IF(NEW.created_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$',
         NEW.created_at, NULL),
      '%d/%m/%Y %H:%i:%s'
    ),
    NEW.created_at_dt
  );
