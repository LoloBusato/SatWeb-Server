-- 0007_order_current_branch.sql
-- Fase 2.3: flujo de equipos entre sucursales.
-- Separa el concepto de ORIGEN (orders.branches_id — donde se creó la orden,
-- inmutable, usado por pickup-pending/incucai-eligible) de la UBICACIÓN
-- ACTUAL (orders.current_branch_id — donde está físicamente el equipo,
-- cambia con cada transferencia). El listado general /api/v2/orders ahora
-- hace match con OR entre origen y ubicación actual, para que el lab vea
-- las órdenes que recibió aunque se originen en otra sucursal.
--
-- Backfill obligatorio: las ~13k órdenes preexistentes se asumen físicamente
-- en su sucursal de origen hasta que alguien haga la primera transferencia.
-- El paso 2 setea current_branch_id = branches_id; el paso 3 agrega NOT NULL
-- + FK una vez que todas las filas tienen valor.
--
-- Sin filas sintéticas en order_location_history para las órdenes
-- preexistentes — arrancan sin history y se pueblan naturalmente desde el
-- primer POST /transfer. Consistente con el patrón de order_state_history.
--
-- Rollback:
--   DROP TABLE order_location_history;
--   ALTER TABLE orders DROP FOREIGN KEY fk_orders_current_branch,
--                      DROP COLUMN current_branch_id;

ALTER TABLE orders ADD COLUMN current_branch_id INT NULL;

UPDATE orders SET current_branch_id = branches_id WHERE current_branch_id IS NULL;

ALTER TABLE orders
  MODIFY COLUMN current_branch_id INT NOT NULL,
  ADD CONSTRAINT fk_orders_current_branch FOREIGN KEY (current_branch_id)
    REFERENCES branches(idbranches) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE order_location_history (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  from_branch_id INT NULL,
  to_branch_id INT NOT NULL,
  transferred_by INT NOT NULL,
  transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_olh_order (order_id, transferred_at),
  CONSTRAINT fk_olh_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_olh_transferred_by FOREIGN KEY (transferred_by) REFERENCES users(idusers)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
