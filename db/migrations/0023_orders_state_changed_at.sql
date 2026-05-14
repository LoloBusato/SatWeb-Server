-- 0023_orders_state_changed_at.sql
-- Agregamos state_changed_at en orders para tener un anchor real del
-- countdown "tiempo en el estado actual" que pinta el home de Atención al
-- Cliente. Hasta hoy el frontend usaba created_at como proxy, lo cual
-- ignora todos los cambios de estado durante la vida de la orden.
--
-- Backfill: arrancamos con returned_at si la orden ya fue entregada (último
-- cambio relevante registrado), y caemos a created_at para el resto. No es
-- exacto para órdenes con historial de varios cambios — la columna queda
-- precisa de acá en adelante.
--
-- Writers que bumpean este campo:
--   - CRUD/orders.js PUT /:id              (cualquier update del frontend legacy)
--   - CRUD/orders.js PUT /finalizar/:id    (entrega al cliente)
--   - v2 OrderRepository.updateState       (incluye archive-overdue automático)
--
-- Rollback: ALTER TABLE orders DROP COLUMN state_changed_at;

ALTER TABLE orders
  ADD COLUMN state_changed_at DATETIME NULL AFTER returned_at;

UPDATE orders
SET state_changed_at = COALESCE(returned_at, created_at)
WHERE state_changed_at IS NULL;
