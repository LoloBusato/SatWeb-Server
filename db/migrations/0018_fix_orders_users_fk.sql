-- 0018_fix_orders_users_fk.sql
-- Corrige un bug semántico introducido en migración 0011 (Fase 3.1).
--
-- Contexto: la columna `orders.users_id` se llama así por legacy pero
-- semánticamente es un FK a `grupousuarios.idgrupousuarios`, no a
-- `users.idusers`. Las queries legacy (CRUD/orders.js, Messages.js,
-- movname.js) siempre hacen JOIN con `ON orders.users_id = grupousuarios.idgrupousuarios`.
-- El frontend de agregar orden (Orders.jsx) también envía el
-- idgrupousuarios seleccionado como users_id.
--
-- Durante Fase 3.1 agregué `fk_orders_users FOREIGN KEY (users_id)
-- REFERENCES users (idusers)` basado en el nombre de la columna. El
-- orphans-report.txt decía "0 huérfanos" porque los ids históricos
-- coincidían por casualidad numérica (todas las 9391 orders en prod
-- tenían users_id válido tanto en users.idusers como en
-- grupousuarios.idgrupousuarios).
--
-- Pero grupousuarios tiene 17 filas activas, y para 5 de ellas (ids
-- 6, 19, 25, 29, 30) NO existe un idusers con el mismo número. Si un
-- user agrega una orden con el grupo "Admin" (id 19), "stock" (id 25),
-- "NUEVO" (id 29), "system" (id 30) o "Vacio" (id 6), el INSERT falla
-- con ER_NO_REFERENCED_ROW_2, el backend devuelve el MySQL error
-- object, y el frontend renderizaba "[object Object]" al alertar.
--
-- Reportado como bug en prod 2026-04-24 al intentar agregar órdenes.
--
-- Fix: dropear el FK incorrecto y agregar uno semánticamente correcto.
-- Los 9391 orders existentes pasan el nuevo FK (100% matchean
-- grupousuarios.idgrupousuarios — verificado con LEFT JOIN en el probe
-- previo a esta migración).
--
-- Rollback (si alguna vez hiciera falta, improbable):
--   ALTER TABLE orders DROP FOREIGN KEY fk_orders_grupos;
--   ALTER TABLE orders ADD CONSTRAINT fk_orders_users FOREIGN KEY (users_id) REFERENCES users (idusers);

ALTER TABLE orders DROP FOREIGN KEY fk_orders_users;

ALTER TABLE orders
  ADD CONSTRAINT fk_orders_grupos FOREIGN KEY (users_id) REFERENCES grupousuarios (idgrupousuarios);
