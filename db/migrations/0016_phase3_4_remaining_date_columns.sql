-- 0016_phase3_4_remaining_date_columns.sql
-- Fase 3.4 — replica el patrón dual-write validado en el PoC (migration 0015)
-- para las 3 columnas VARCHAR de fecha restantes:
--
--   - orders.created_at (VARCHAR(11), d/m/yyyy) → orders.created_at_dt (DATETIME)
--   - orders.returned_at (VARCHAR(11) NULL, d/m/yyyy) → orders.returned_at_dt (DATETIME NULL)
--   - reducestock.date (VARCHAR(50), d/m/yyyy HH:mm:ss) → reducestock.date_dt (DATETIME)
--
-- Investigación previa confirmó 100% parseable en las tres (9386 orders con
-- created_at siempre válido; 9076/9386 returned_at no-null todos válidos
-- con 310 NULLs; 6662 reducestock todos válidos).
--
-- Diferencias con el PoC:
--
--   * orders.returned_at es nullable y se escribe TARDÍAMENTE por UPDATE
--     (tanto legacy CRUD/orders.js:113 y CRUD/movname.js:169 como v2
--     OrderRepository.updateState() hacen UPDATE para setearlo cuando
--     una orden pasa al estado "entregado"). Por eso necesita trigger
--     BEFORE INSERT **y** BEFORE UPDATE. El UPDATE trigger es careful:
--     si el VARCHAR no cambió (<=>), deja la DATETIME intacta —
--     así un UPDATE que sólo toca state_id no toca la DATETIME.
--
--   * orders.created_at no se toca por ningún UPDATE → sólo trigger
--     BEFORE INSERT. Como no hay hora en el VARCHAR, el DATETIME queda
--     a 00:00:00 Argentina — suficiente para orderBy/filters.
--
--   * reducestock.date es igual al PoC de messages (formato con hora,
--     sólo INSERT).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS orders_dates_before_update;
--   DROP TRIGGER IF EXISTS orders_dates_before_insert;
--   DROP TRIGGER IF EXISTS reducestock_date_before_insert;
--   ALTER TABLE orders DROP COLUMN returned_at_dt, DROP COLUMN created_at_dt;
--   ALTER TABLE reducestock DROP COLUMN date_dt;

-- ========== orders.created_at ==========

ALTER TABLE orders ADD COLUMN created_at_dt DATETIME NULL AFTER created_at;

UPDATE orders
  SET created_at_dt = STR_TO_DATE(created_at, '%d/%m/%Y');

ALTER TABLE orders
  MODIFY COLUMN created_at_dt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ========== orders.returned_at ==========

ALTER TABLE orders ADD COLUMN returned_at_dt DATETIME NULL AFTER returned_at;

UPDATE orders
  SET returned_at_dt = STR_TO_DATE(returned_at, '%d/%m/%Y')
  WHERE returned_at IS NOT NULL;

-- returned_at_dt queda NULL (sin default) — coherente con semántica legacy.

-- ========== reducestock.date ==========

ALTER TABLE reducestock ADD COLUMN date_dt DATETIME NULL AFTER `date`;

UPDATE reducestock
  SET date_dt = STR_TO_DATE(`date`, '%d/%m/%Y %H:%i:%s');

ALTER TABLE reducestock
  MODIFY COLUMN date_dt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ========== Triggers ==========

DROP TRIGGER IF EXISTS orders_dates_before_insert;

CREATE TRIGGER orders_dates_before_insert
  BEFORE INSERT ON orders
  FOR EACH ROW
  SET
    NEW.created_at_dt = IFNULL(
      STR_TO_DATE(
        IF(NEW.created_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$', NEW.created_at, NULL),
        '%d/%m/%Y'
      ),
      NEW.created_at_dt
    ),
    NEW.returned_at_dt = CASE
      WHEN NEW.returned_at IS NULL THEN NULL
      WHEN NEW.returned_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
        THEN STR_TO_DATE(NEW.returned_at, '%d/%m/%Y')
      ELSE NEW.returned_at_dt
    END;

DROP TRIGGER IF EXISTS orders_dates_before_update;

-- BEFORE UPDATE sólo toca returned_at_dt — created_at_dt es inmutable
-- una vez que la orden existe. Si el VARCHAR returned_at no cambió,
-- deja la DATETIME intacta para que UPDATEs no-relacionados (state_id,
-- current_branch_id, etc.) no sobreescriban la DATETIME.
CREATE TRIGGER orders_dates_before_update
  BEFORE UPDATE ON orders
  FOR EACH ROW
  SET NEW.returned_at_dt = CASE
    WHEN NEW.returned_at <=> OLD.returned_at THEN NEW.returned_at_dt
    WHEN NEW.returned_at IS NULL THEN NULL
    WHEN NEW.returned_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'
      THEN STR_TO_DATE(NEW.returned_at, '%d/%m/%Y')
    ELSE NEW.returned_at_dt
  END;

DROP TRIGGER IF EXISTS reducestock_date_before_insert;

CREATE TRIGGER reducestock_date_before_insert
  BEFORE INSERT ON reducestock
  FOR EACH ROW
  SET NEW.date_dt = IFNULL(
    STR_TO_DATE(
      IF(NEW.`date` REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}$',
         NEW.`date`, NULL),
      '%d/%m/%Y %H:%i:%s'
    ),
    NEW.date_dt
  );
