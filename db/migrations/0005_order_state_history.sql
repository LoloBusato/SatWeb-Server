-- 0005_order_state_history.sql
-- Audit trail para transiciones de estado de órdenes. Cada PATCH al estado
-- de una orden vía /api/v2/orders/:id/state registra una fila acá, además
-- de actualizar orders.state_id (y, si el nuevo estado se llama 'ENTREGADO',
-- seteando también orders.returned_at).
--
-- Sin FK sobre from_state_id ni to_state_id a propósito: aunque la UI de v2
-- usa soft-delete, el legacy /api/states/:id todavía hace hard DELETE. Si
-- dejamos FK, ese DELETE rompe con constraint error. Preferimos mantener los
-- ids como referencia blanda y resolver el nombre del estado por JOIN suave
-- al servir el historial (LEFT JOIN + NULL-safe rendering).
--
-- Rollback:
--   DROP TABLE order_state_history;

CREATE TABLE order_state_history (
  id INT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  from_state_id INT NULL,
  to_state_id INT NOT NULL,
  changed_by INT NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_osh_order (order_id, changed_at),
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders(order_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_osh_changed_by FOREIGN KEY (changed_by) REFERENCES users(idusers)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
