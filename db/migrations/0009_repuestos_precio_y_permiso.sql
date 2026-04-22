-- 0009_repuestos_precio_y_permiso.sql
-- Fase 2.5: precio sugerido de venta en el catálogo de repuestos + permiso
-- nuevo para el CRUD completo en /api/v2/repuestos.
--
-- Cambios:
-- 1. Nueva columna `repuestos.precio_venta_sugerido DECIMAL(10,2) NULL`.
--    DECIMAL desde el vamos (decisión explícita) para no arrastrar deuda
--    a Fase 3. Nullable: repuestos existentes no tienen precio sugerido
--    hasta que alguien lo configure.
-- 2. Nuevo permiso `repuestos:manage` (paralelo a users:manage, branches:manage,
--    groups:manage, states:manage — uno por recurso administrable).
-- 3. Asignación idempotente al grupo del user `prueba` (admin de facto).
--
-- Backwards-compat: el legacy /api/stockitem hace SELECT *, así que el
-- nuevo campo aparece en sus respuestas JSON. El frontend legacy lo
-- ignora (no usa ese field).
--
-- Rollback:
--   DELETE FROM group_permissions WHERE permission_id = (SELECT id FROM permissions WHERE code='repuestos:manage');
--   DELETE FROM permissions WHERE code='repuestos:manage';
--   ALTER TABLE repuestos DROP COLUMN precio_venta_sugerido;

ALTER TABLE repuestos ADD COLUMN precio_venta_sugerido DECIMAL(10,2) NULL;

INSERT IGNORE INTO permissions (code, description) VALUES
  ('repuestos:manage', 'Crear, editar y eliminar items del catálogo de repuestos');

INSERT IGNORE INTO group_permissions (group_id, permission_id)
SELECT u.grupos_id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.username = 'prueba'
  AND p.code = 'repuestos:manage';
