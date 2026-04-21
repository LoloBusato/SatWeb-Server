-- 0001_widen_password.sql
-- Amplía users.password de VARCHAR(45) a VARCHAR(60) para poder almacenar
-- hashes bcrypt (60 chars fijos). Sin esta migración el nuevo AuthService
-- truncaría los hashes al escribir, corrompiendo passwords silenciosamente.
--
-- Impacto: cambio backward-compatible (60 >= 45). El backend viejo sigue
-- funcionando sin modificaciones porque los valores plaintext existentes
-- siguen entrando sin problema en el campo más ancho.
--
-- Rollback: ALTER TABLE users MODIFY COLUMN password VARCHAR(45) NOT NULL;
--          (⚠ destructivo si ya hay hashes bcrypt — truncaría a 45 chars).

ALTER TABLE users MODIFY COLUMN password VARCHAR(60) NOT NULL;
