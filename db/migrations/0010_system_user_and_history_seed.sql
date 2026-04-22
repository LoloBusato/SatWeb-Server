-- 0010_system_user_and_history_seed.sql
-- Dos cambios para cerrar backlog de Fase 2:
--
-- 1. System user: usuario `system` para servir de FK en
--    order_state_history.changed_by cuando el cron de INCUCAI archiva
--    órdenes automáticamente (también lo usa el seed sintético abajo).
--    Password seteado a STRING VACÍO: la validación de body Zod en
--    /api/v2/auth/login y /api/users/login requiere password min(1),
--    así que el login nunca llega a la comparación. Es efectivamente
--    no-loguable sin usar special-casing en la AuthService.
--
-- 2. Seed sintético de order_state_history: una fila por orden
--    actualmente en el estado "ready" de su sucursal (según
--    branch_settings) y SIN entry previa para ese (order_id,
--    to_state_id). Usa STR_TO_DATE sobre orders.created_at (d/m/yyyy)
--    con fallback NOW() - 1 DAY. Pre-filtra con REGEXP para evitar
--    errores de strict mode cuando el valor no parsea.
--    Si no hay branch_settings configurado para ninguna sucursal al
--    momento de correr esta migración, el seed es no-op (JOIN INNER
--    con branch_settings no matchea nada). Se vuelve efectivo cuando
--    el admin configure la primera sucursal.
--
-- Idempotente:
--   - INSERT IGNORE para system user (UNIQUE(username)).
--   - NOT EXISTS filter evita duplicar history rows.
--
-- Rollback:
--   DELETE FROM order_state_history WHERE note = 'seed sintético migración 0010';
--   DELETE FROM users WHERE username = 'system';

-- Grupo 'system' dedicado (sin permisos asignados en group_permissions).
-- Necesario para que el system user NO cuente como admin en chequeos
-- del tipo "último usuario con branches:view_all" (que consideran a
-- cualquier user activo cuyo grupo tenga ese permiso).
INSERT IGNORE INTO grupousuarios (grupo, permisos) VALUES ('system', '');

INSERT IGNORE INTO users (username, password, grupos_id, branch_id, user_color)
SELECT 'system',
       '',
       (SELECT idgrupousuarios FROM grupousuarios WHERE grupo = 'system' LIMIT 1),
       (SELECT idbranches FROM branches ORDER BY idbranches LIMIT 1),
       '#000000';

INSERT INTO order_state_history (order_id, from_state_id, to_state_id, changed_by, changed_at, note)
SELECT o.order_id,
       NULL,
       o.state_id,
       (SELECT idusers FROM users WHERE username = 'system' LIMIT 1),
       COALESCE(
         STR_TO_DATE(
           IF(o.created_at REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$', o.created_at, NULL),
           '%d/%m/%Y'
         ),
         NOW() - INTERVAL 1 DAY
       ),
       'seed sintético migración 0010'
FROM orders o
JOIN branch_settings bs ON bs.branch_id = o.branches_id
WHERE o.state_id = bs.ready_state_id
  AND o.returned_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM order_state_history h
    WHERE h.order_id = o.order_id AND h.to_state_id = o.state_id
  );
