-- 0011_phase3_1_base.sql
-- Fase 3.1 — base técnica del refactor de schema (arranca la deuda técnica).
-- Tres cambios aditivos + backfill que NO rompen el legacy:
--
-- 1. states.marks_as_delivered (flag explícito).
--    Reemplaza la regla hardcodeada "si el estado se llama 'ENTREGADO'
--    se setea returned_at" con una columna. El código de v2 lee la
--    columna en vez del nombre. Back-compat: por default TODO estado
--    tiene el flag en 0, y se sube a 1 para la fila cuyo nombre sea
--    'ENTREGADO'. Si en prod no existe una fila con ese nombre exacto,
--    el UPDATE no afecta filas y el sistema sigue funcionando (sólo
--    nunca auto-seteará returned_at hasta que alguien prenda el flag).
--
-- 2. Charset utf8mb3 → utf8mb4 en 8 tablas pendientes.
--    El resto del schema ya está en utf8mb4_0900_ai_ci. Estas 8 tablas
--    quedaron colgadas del snapshot original. Se excluye `cobros`
--    porque está fuera de alcance (el usuario explicitó no tocar cobros).
--    ALTER TABLE ... CONVERT TO preserva datos (reescribe cada varchar).
--
-- 3. FKs adicionales sobre columnas con 0 huérfanos.
--    Per orphans-report.txt: devices.brand_id, orders.users_id,
--    stock.proveedor_id y stock.branch_id tienen 0 huérfanos y son
--    seguros de aplicar sin cleanup previo. Las demás FKs (stock.repuesto_id,
--    messages.orderId, reducestock.*) quedan para Fase 3.2 porque
--    requieren limpieza o SET NULL.
--    stock.branch_id es NULLABLE, la FK permite NULLs sin problema.
--    No se tocan los índices existentes (KEY ..._FKEY) porque MySQL crea
--    su propio índice interno para la FK cuando no hay uno utilizable.
--
-- Rollback (en orden inverso):
--   ALTER TABLE stock DROP FOREIGN KEY fk_stock_branch;
--   ALTER TABLE stock DROP FOREIGN KEY fk_stock_proveedor;
--   ALTER TABLE orders DROP FOREIGN KEY fk_orders_users;
--   ALTER TABLE devices DROP FOREIGN KEY fk_devices_brand;
--   -- charsets: no es necesario revertir (utf8mb4 es superset de utf8mb3)
--   ALTER TABLE states DROP COLUMN marks_as_delivered;

-- 1. states.marks_as_delivered
ALTER TABLE states
  ADD COLUMN marks_as_delivered TINYINT(1) NOT NULL DEFAULT 0 AFTER color;

UPDATE states SET marks_as_delivered = 1 WHERE state = 'ENTREGADO';

-- 2. Charset utf8mb3 → utf8mb4 (excluye cobros por scope).
ALTER TABLE almacenamientos_repuestos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE calidades_repuestos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE colores CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE garantia CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE garantia_estados CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE nombres_repuestos CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE repuestosdevices CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE stockbranch CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 3. FKs con 0 huérfanos (orphans-report.txt).
ALTER TABLE devices
  ADD CONSTRAINT fk_devices_brand FOREIGN KEY (brand_id) REFERENCES brands (brandid);

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_users FOREIGN KEY (users_id) REFERENCES users (idusers);

ALTER TABLE stock
  ADD CONSTRAINT fk_stock_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores (idproveedores);

ALTER TABLE stock
  ADD CONSTRAINT fk_stock_branch FOREIGN KEY (branch_id) REFERENCES branches (idbranches);
