-- 0019_add_users_enabled.sql
-- Agrega un flag `enabled` a users para impedir login sin tener que borrar
-- el row ni cambiar el username (el hack previo era renombrar con prefijo
-- "SINUSO"). Los users con enabled=0 son rechazados tanto por /api/v2/auth/login
-- como por el CRUD legacy /api/login.
--
-- Rollout: la columna default es 1 (los nuevos users quedan habilitados),
-- pero inicialmente deshabilitamos todo excepto los 4 users activos hoy:
--   10=bicha, 12=Facu, 13=prueba, 15=Lauti
-- Esto deshabilita implícitamente los 9 SINUSO* (ids 14,16,17,18,20,22,23,24,27)
-- y cualquier otro user residual (system, Usuario1restore, etc.).
--
-- Rollback: ALTER TABLE users DROP COLUMN enabled;

ALTER TABLE users
  ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1;

UPDATE users
SET enabled = 0
WHERE idusers NOT IN (10, 12, 13, 15);
