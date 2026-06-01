-- 0028: extender sistema de tareas
--
-- - repeat_type agrega 'biweekly' (cada 2 semanas, día configurable
--   via repeat_day_of_week). Baños y basura usan esto.
-- - is_random_time + random_time_from + random_time_to: cuando la
--   hora exacta de la tarea no importa (difusiones por WA, mensajes
--   al gremio) y se randomiza dentro de una ventana para que no
--   parezca un bot.
-- - task_instances.assigned_to_user_id pasa a NULL-able (para
--   completitud del schema; en la práctica las tareas de grupo
--   siempre fan-out a usuarios concretos para que cada uno vea la
--   tarea en su /pending — completar una marca a todas).

ALTER TABLE tasks
  MODIFY COLUMN repeat_type ENUM('none','daily','weekly','biweekly','monthly') DEFAULT 'none',
  ADD COLUMN is_random_time TINYINT(1) DEFAULT 0,
  ADD COLUMN random_time_from TIME DEFAULT NULL,
  ADD COLUMN random_time_to TIME DEFAULT NULL;

ALTER TABLE task_instances
  MODIFY COLUMN assigned_to_user_id INT DEFAULT NULL;
