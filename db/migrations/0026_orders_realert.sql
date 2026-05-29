-- 0026: orders.realert_count + orders.realert_until
--
-- Escalones de re-alerta para acciones "mismo estado" del home de
-- Atención al Cliente (No vino / No contestó / No llegó / No pagó):
--   - realert_count cuenta cuántas veces se aplicó la acción en este
--     ciclo de estado. Se resetea cuando la orden cambia de estado.
--   - realert_until guarda el momento (wall-clock AR) hasta el cual
--     la orden queda "silenciada" en Esperando. categorize() la deja
--     en wait aunque haya vencido el plazo original mientras
--     realert_until > NOW().
--
-- Los días por escalón viven en frontend (REALERT_DAYS en
-- atencionWorkflow.js); el backend sólo persiste el resultado.

ALTER TABLE orders
  ADD COLUMN realert_count INT DEFAULT 0,
  ADD COLUMN realert_until DATETIME DEFAULT NULL;
