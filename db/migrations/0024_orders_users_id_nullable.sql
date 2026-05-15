-- 0024_orders_users_id_nullable.sql
-- Permite orders.users_id = NULL para representar "orden sin asignar":
--   1. Entregadas: una vez que el cliente retira, ya no hay grupo dueño.
--      PUT /orders/finalizar/:id pasa a setear users_id = NULL en vez del
--      hardcoded 18 ("entregado").
--   2. INCUCAI > 90 días: un nuevo paso del cron archive-overdue-tick
--      orfana las que llevan ≥ incucai_after_days (90d) en INCUCAI. En
--      el home admin el tab INCUCAI las muestra como "Propiedad de
--      TheDoniPhone".
--
-- El FK fk_orders_grupos sigue válido — NULL no viola el constraint.
-- Las queries con JOIN ... ON orders.users_id = grupousuarios.idgrupousuarios
-- pierden las orfanadas (LEFT JOIN-friendly); revisar consumers que asuman
-- "todas las orders tienen grupo".
--
-- Rollback:
--   ALTER TABLE orders MODIFY COLUMN users_id INT NOT NULL;

ALTER TABLE orders MODIFY COLUMN users_id INT NULL;
