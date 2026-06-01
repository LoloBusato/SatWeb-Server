-- 0027: sistema de tareas para Atención / Lab / Admin
--
-- tasks         = definición (config inmutable salvo edición del admin)
-- task_instances = ocurrencias concretas que llegan al usuario. Una por
--                  usuario+fecha (for_each_user=1) o una por grupo+fecha
--                  (for_each_user=0). El cron diario las genera para las
--                  próximas 24h leyendo el repeat_type de la tarea madre.

CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assigned_to_group_id INT DEFAULT NULL,
  assigned_to_user_id INT DEFAULT NULL,
  for_each_user TINYINT(1) DEFAULT 0,
  can_postpone TINYINT(1) DEFAULT 1,
  repeat_type ENUM('none','daily','weekly','monthly') DEFAULT 'none',
  repeat_time TIME DEFAULT NULL,
  repeat_day_of_week TINYINT DEFAULT NULL,
  repeat_day_of_month TINYINT DEFAULT NULL,
  starts_at DATETIME NOT NULL,
  created_by INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS task_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  assigned_to_user_id INT NOT NULL,
  assigned_to_group_id INT DEFAULT NULL,
  scheduled_for DATETIME NOT NULL,
  postponed_until DATETIME DEFAULT NULL,
  postpone_count INT DEFAULT 0,
  completed_at DATETIME DEFAULT NULL,
  completed_by INT DEFAULT NULL,
  status ENUM('pending','completed','postponed') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE KEY uq_task_user_sched (task_id, assigned_to_user_id, scheduled_for)
);
