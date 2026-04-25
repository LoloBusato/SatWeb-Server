-- 0022_movcategories_is_system.sql
-- Flag para proteger categorías financieras críticas. 10 categorías están
-- hardcodeadas POR NOMBRE en el cálculo de utilidad neta de Resumen.js
-- (Venta, Reparaciones, Alquiler, Envios, Comida, Sueldos, Varios, CMV,
-- CMVBelgrano) y 1 más por nombre exacto en el flujo de Cobro Sucursal
-- (Caja). Renombrarlas o borrarlas rompe el cálculo en silencio
-- (categoriesDicc[oldName] devuelve undefined → NaN → suma corrupta).
--
-- Mismo patrón que states.forces_admin_assignment (migración 0021): flag
-- declarativo, UI bloquea Editar/Eliminar cuando =1.
--
-- Backfill: matchea por nombre actual. Es one-shot, no se reaplica si los
-- renombrás después (lo cual ya no se puede porque el flag bloquea).
--
-- Rollback: ALTER TABLE movcategories DROP COLUMN is_system_category;

ALTER TABLE movcategories
  ADD COLUMN is_system_category TINYINT(1) NOT NULL DEFAULT 0;

UPDATE movcategories
SET is_system_category = 1
WHERE categories IN (
  'Venta', 'Reparaciones', 'Alquiler', 'Envios', 'Comida',
  'Sueldos', 'Varios', 'CMV', 'CMVBelgrano', 'Caja'
);
