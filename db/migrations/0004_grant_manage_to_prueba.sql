-- 0004_grant_manage_to_prueba.sql
-- 0002 asignó solo branches:view_all al grupo del user `prueba` pensando
-- únicamente en el bypass de multi-tenancy. Pero como `prueba` es el admin
-- de facto del sistema (no existe otro rol "admin" aún), el grupo necesita
-- también los 4 permisos de gestión para poder operar el nuevo backend.
--
-- Idempotente: INSERT IGNORE + CROSS JOIN que devuelve 0 filas si el user
-- no existe.
--
-- Rollback:
--   DELETE FROM group_permissions
--   WHERE group_id = (SELECT grupos_id FROM users WHERE username='prueba')
--     AND permission_id IN (
--       SELECT id FROM permissions
--       WHERE code IN ('users:manage','branches:manage','groups:manage','states:manage')
--     );

INSERT IGNORE INTO group_permissions (group_id, permission_id)
SELECT u.grupos_id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.username = 'prueba'
  AND p.code IN ('users:manage', 'branches:manage', 'groups:manage', 'states:manage');
