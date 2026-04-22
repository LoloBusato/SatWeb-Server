-- 0006_branch_settings.sql
-- Config por sucursal para el flujo automático de equipos sin retirar
-- (Fase 2.2). Cada sucursal define qué estado considera "listo" y qué
-- estado es "INCUCAI" (archivado), más los timers: cuánto esperar antes
-- de recordar al cliente y cuántos días antes de archivar.
--
-- La tabla es opcional: hasta que un admin configure una sucursal,
-- /api/v2/orders/pickup-pending y /incucai-eligible devuelven vacío
-- para esa sucursal. La automatización de transición requiere que la
-- sucursal tenga settings configurados.
--
-- FKs hacia states con ON DELETE RESTRICT: si un admin intenta
-- soft-deletear un estado referenciado por branch_settings, primero
-- tiene que reconfigurar los settings. (Soft-delete no dispara la FK
-- porque solo setea deleted_at; pero el hard delete del legacy sí.)
--
-- Rollback:
--   DROP TABLE branch_settings;

CREATE TABLE branch_settings (
  branch_id INT NOT NULL,
  ready_state_id INT NOT NULL,
  pickup_reminder_hours INT NOT NULL DEFAULT 48,
  incucai_state_id INT NOT NULL,
  incucai_after_days INT NOT NULL DEFAULT 180,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id),
  CONSTRAINT fk_bs_branch FOREIGN KEY (branch_id)
    REFERENCES branches(idbranches) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_bs_ready_state FOREIGN KEY (ready_state_id)
    REFERENCES states(idstates) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_bs_incucai_state FOREIGN KEY (incucai_state_id)
    REFERENCES states(idstates) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
