-- 0021_states_forces_admin_assignment.sql
-- Flag genérico en states para "este estado fuerza la asignación al grupo
-- admin". Reemplaza el chequeo hardcodeado contra INCUCAI por una regla
-- declarativa. Cualquier futuro estado que necesite el mismo comportamiento
-- se marca con forces_admin_assignment = 1 sin tocar código.
--
-- Inicial: marca INCUCAI (idstates=24) y SOLUCIONA ADMIN (idstates=23).
-- El UPDATE matchea por nombre porque es one-shot — después del apply,
-- el código usa solo el flag (rename-safe).
--
-- Rollback: ALTER TABLE states DROP COLUMN forces_admin_assignment;

ALTER TABLE states
  ADD COLUMN forces_admin_assignment TINYINT(1) NOT NULL DEFAULT 0;

UPDATE states
SET forces_admin_assignment = 1
WHERE state IN ('INCUCAI', 'SOLUCIONA ADMIN')
  AND deleted_at IS NULL;
