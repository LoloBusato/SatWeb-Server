-- 0020_branch_settings_delivered_state.sql
-- Cierra la migración a IDs para el sistema de estados. branch_settings ya
-- tenía ready_state_id e incucai_state_id (FKs vía Fase 2.2). Falta el
-- delivered_state_id (el ENTREGADO operativo) que hasta ahora se matcheaba
-- por nombre 'ENTREGADO' en 4 endpoints legacy + 1 chequeo v2 + 5 condicionales
-- frontend. Renombrar el estado rompía esos matchers en silencio (incidente
-- de "REPARADO CLIENTE AVISADO" del 2026-04-25).
--
-- Después de aplicar esta migración + el cambio de código pareja, los 3
-- estados especiales (ENTREGADO, INCUCAI, REPARADO CLIENTE AVISADO) pueden
-- renombrarse libremente sin romper nada — todo resuelve por ID via
-- branch_settings.
--
-- Backfill: el id del estado actualmente llamado 'ENTREGADO' (idstates=6).
-- Si en alguna sucursal querés cambiar la semántica, después editás solo
-- esa fila.
--
-- Rollback: ALTER TABLE branch_settings DROP FOREIGN KEY fk_bs_delivered;
--           ALTER TABLE branch_settings DROP COLUMN delivered_state_id;

ALTER TABLE branch_settings ADD COLUMN delivered_state_id INT NULL;

UPDATE branch_settings SET delivered_state_id = (
  SELECT idstates FROM states WHERE state = 'ENTREGADO' AND deleted_at IS NULL LIMIT 1
);

ALTER TABLE branch_settings MODIFY COLUMN delivered_state_id INT NOT NULL;

ALTER TABLE branch_settings
  ADD CONSTRAINT fk_bs_delivered
  FOREIGN KEY (delivered_state_id) REFERENCES states (idstates);
