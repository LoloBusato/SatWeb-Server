-- 0008_stock_transfers.sql
-- Fase 2.4: transferencias de stock entre sucursales.
-- Cada POST a /api/v2/stock-transfers registra acá la operación, además
-- de mutar las dos filas correspondientes de stockbranch (-N en la sucursal
-- origen, +N en destino via ON DUPLICATE KEY UPDATE sobre el UNIQUE
-- (stock_id, branch_id) que ya existe en stockbranch).
--
-- Sin FK a stock(idstock), branches(idbranches) a propósito — consistente
-- con los audit trails previos (order_state_history, order_location_history):
-- el legacy /api/stock/:id DELETE y /api/branches/:id DELETE hacen hard
-- DELETE y una FK acá los bloquearía. Se acepta que el histórico puede
-- tener ids colgados; en las queries de listado se usa LEFT JOIN.
--
-- Rollback:
--   DROP TABLE stock_transfers;

CREATE TABLE stock_transfers (
  id INT NOT NULL AUTO_INCREMENT,
  stock_id INT NOT NULL,
  from_branch_id INT NOT NULL,
  to_branch_id INT NOT NULL,
  cantidad INT NOT NULL,
  transferred_by INT NOT NULL,
  transferred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_st_stock (stock_id, transferred_at),
  KEY idx_st_from (from_branch_id, transferred_at),
  KEY idx_st_to (to_branch_id, transferred_at),
  CONSTRAINT fk_st_user FOREIGN KEY (transferred_by) REFERENCES users(idusers)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
