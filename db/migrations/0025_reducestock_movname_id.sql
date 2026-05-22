-- 0025: reducestock.movname_id
--
-- Permite distinguir filas de reducestock creadas durante el cobro
-- (movesPreVentaCobro) de las creadas previamente desde Mensajes
-- (POST /reduceStock standalone). Habilita revert quirúrgico de un
-- "Retiro pre-venta" sin destruir el reducestock pre-existente.
--
-- Mayo 2026 — gatillado por el bug donde al revertir un cobro
-- desaparecía todo el reducestock de la orden y el operador perdía
-- el rastro de los equipos cargados desde Mensajes.

ALTER TABLE reducestock
  ADD COLUMN movname_id INT DEFAULT NULL;
