-- 0002_permissions_tables.sql
-- Introduce permisos normalizados: tablas `permissions` y `group_permissions`.
-- Reemplaza el uso de `grupousuarios.permisos` (varchar) por un modelo
-- relacional real. La columna vieja queda intacta (columna muerta) y se
-- elimina recién en Fase 3, una vez que el frontend migra por completo.
--
-- También asigna `branches:view_all` al grupo del usuario `prueba`, que
-- hoy funciona como admin por convención (hardcoded en el código viejo).
-- El nuevo middleware de autorización usa este permiso en lugar del
-- chequeo por username.
--
-- Rollback:
--   DROP TABLE group_permissions;
--   DROP TABLE permissions;

CREATE TABLE permissions (
  id INT NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  description VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY permissions_code_unique (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE group_permissions (
  group_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, permission_id),
  KEY idx_gp_permission (permission_id),
  CONSTRAINT fk_gp_group
    FOREIGN KEY (group_id) REFERENCES grupousuarios(idgrupousuarios)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_gp_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Seed del catálogo inicial de permisos. INSERT IGNORE por idempotencia.
INSERT IGNORE INTO permissions (code, description) VALUES
  ('branches:view_all', 'Ver órdenes/datos de todas las sucursales (bypass de multi-tenancy)'),
  ('users:manage',      'Crear, editar y eliminar usuarios'),
  ('branches:manage',   'Crear, editar y eliminar sucursales'),
  ('groups:manage',     'Crear, editar y eliminar grupos y sus permisos'),
  ('states:manage',     'Crear, editar y eliminar estados de órdenes');

-- Asignar branches:view_all al grupo del user `prueba`. Si el usuario no
-- existe, el SELECT devuelve 0 filas y el INSERT no hace nada (salvaguarda).
INSERT IGNORE INTO group_permissions (group_id, permission_id)
SELECT u.grupos_id, p.id
FROM users u
CROSS JOIN permissions p
WHERE u.username = 'prueba'
  AND p.code = 'branches:view_all';
