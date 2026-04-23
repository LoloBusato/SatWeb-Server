-- 0012_phase3_2_orphan_cleanup.sql
-- Fase 3.2 — cleanup de huérfanos + FKs restantes + drop de columna muerta.
-- Complementa 0011: allá se agregaron las 4 FKs con 0 huérfanos. Acá se
-- limpia lo que tenía huérfanos y se agregan las FKs faltantes.
--
-- Cambios (en orden de dependencia):
--
-- 1. Drop de orders.order_primary_id.
--    Investigado en Fase 3.3: 3833 filas con valor = 0 (literalmente
--    todas), ninguna apunta a una order real, nadie lee/escribe la
--    columna desde 22/9/2023 (último INSERT con valor != NULL fue
--    order_id=7693). Legacy y v2 la ignoran. Cliente tampoco la usa.
--    Sin triggers, sin views, sin índices. Basura pura.
--
-- 2. Limpieza de 7 stock items huérfanos + FK stock.repuesto_id.
--    Los 7 referencian repuesto_ids (9, 341, 631, 935, 939) que no
--    existen en `repuestos` ni siquiera soft-deleted (la tabla no
--    tiene deleted_at). Decisión: borrar los 7. El idstock=1057 tenía
--    3 filas en `garantia` en estado "En prueba" — se borran en cascada
--    (garantia no tiene ON DELETE CASCADE, lo hago explícito; stockbranch
--    sí tiene CASCADE sobre stock_id así que cae solo).
--    Post-cleanup, FK stock.repuesto_id → repuestos.idrepuestos es segura.
--
-- 3. messages.orderId: 7 huérfanos → SET NULL + columna nullable + FK
--    con ON DELETE SET NULL.
--    El usuario decidió preservar el texto y fecha de los mensajes
--    colgados de órdenes hard-deleted en el legacy (auditoría). Eso
--    obliga a hacer la columna nullable. El INSERT legacy
--    (CRUD/messages.js) siempre pasa un orderId válido, así que no
--    rompe. ON DELETE SET NULL cubre el caso futuro de borrar una
--    orden sin perder sus mensajes.
--
-- 4. reducestock.stockid + reducestock.stockbranch_id: 89 + 568 huérfanos
--    → SET NULL + FKs con ON DELETE SET NULL.
--    Ambas columnas ya son nullable (schema lo permite). Los huérfanos
--    son registros de consumo de stock (reducciones de inventario por
--    uso en reparaciones o ventas) donde el stock o stockbranch original
--    fue hard-deleted hace tiempo. Preservamos el audit trail
--    (userid, fecha, orderid) convirtiendo los refs muertos en NULL.
--    Los JOINs del legacy (CRUD/reduceStock.js) ya filtran estos rows
--    implícitamente con INNER JOIN — no hay cambio de comportamiento.
--
-- Rollback (conceptual):
--   ALTER TABLE reducestock DROP FOREIGN KEY fk_reducestock_stockbranch;
--   ALTER TABLE reducestock DROP FOREIGN KEY fk_reducestock_stock;
--   ALTER TABLE messages DROP FOREIGN KEY fk_messages_order;
--   ALTER TABLE messages MODIFY orderId INT NOT NULL;
--   ALTER TABLE stock DROP FOREIGN KEY fk_stock_repuesto;
--   -- Los DELETE y UPDATEs NO son reversibles.
--   ALTER TABLE orders ADD COLUMN order_primary_id INT NULL;

-- 1. Drop de columna muerta.
ALTER TABLE orders DROP COLUMN order_primary_id;

-- 2. Stock cleanup + FK.
--    Garantia primero (sin CASCADE), stockbranch cae por cascade cuando
--    se borra stock.
DELETE FROM garantia WHERE stock_id IN (361, 436, 1057, 1324, 1339, 1340, 1534);
DELETE FROM stock WHERE idstock IN (361, 436, 1057, 1324, 1339, 1340, 1534);

ALTER TABLE stock
  ADD CONSTRAINT fk_stock_repuesto FOREIGN KEY (repuesto_id) REFERENCES repuestos (idrepuestos);

-- 3. messages cleanup + FK.
--    Hay que alterar la columna a NULLABLE antes del UPDATE, si no
--    strict mode rechaza el SET = NULL sobre una columna NOT NULL.
ALTER TABLE messages MODIFY orderId INT NULL;

UPDATE messages m
  LEFT JOIN orders o ON o.order_id = m.orderId
  SET m.orderId = NULL
  WHERE o.order_id IS NULL;

ALTER TABLE messages
  ADD CONSTRAINT fk_messages_order FOREIGN KEY (orderId) REFERENCES orders (order_id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. reducestock cleanup + FKs.
UPDATE reducestock rs
  LEFT JOIN stock s ON s.idstock = rs.stockid
  SET rs.stockid = NULL
  WHERE rs.stockid IS NOT NULL AND s.idstock IS NULL;

ALTER TABLE reducestock
  ADD CONSTRAINT fk_reducestock_stock FOREIGN KEY (stockid) REFERENCES stock (idstock)
    ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE reducestock rs
  LEFT JOIN stockbranch sb ON sb.stockbranchid = rs.stockbranch_id
  SET rs.stockbranch_id = NULL
  WHERE rs.stockbranch_id IS NOT NULL AND sb.stockbranchid IS NULL;

ALTER TABLE reducestock
  ADD CONSTRAINT fk_reducestock_stockbranch FOREIGN KEY (stockbranch_id) REFERENCES stockbranch (stockbranchid)
    ON DELETE SET NULL ON UPDATE CASCADE;
