-- 0003_soft_delete_columns.sql
-- Agrega soft-delete a las 4 tablas que Fase 1 expone como borrables desde
-- la UI: users, branches, grupousuarios, states. NULL = activo, fecha = borrado.
--
-- El backend viejo no conoce este campo. Por default las filas nuevas y las
-- existentes quedan con deleted_at = NULL (activas), así que todas las
-- queries previas siguen devolviendo los mismos resultados. El parche
-- defensivo al CRUD viejo (paso 2.4 del plan) agrega `WHERE deleted_at IS NULL`
-- a los GETs para que tampoco muestre filas soft-deleted por el backend nuevo.
--
-- No se agregan índices sobre deleted_at: las 4 tablas son chicas (<50 filas)
-- y el optimizer no suele usar índices para `IS NULL` cuando la mayoría de
-- las filas satisface la condición. Si alguna crece mucho, revisitar.
--
-- Rollback:
--   ALTER TABLE users         DROP COLUMN deleted_at;
--   ALTER TABLE branches      DROP COLUMN deleted_at;
--   ALTER TABLE grupousuarios DROP COLUMN deleted_at;
--   ALTER TABLE states        DROP COLUMN deleted_at;

ALTER TABLE users         ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE branches      ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE grupousuarios ADD COLUMN deleted_at DATETIME NULL;
ALTER TABLE states        ADD COLUMN deleted_at DATETIME NULL;
