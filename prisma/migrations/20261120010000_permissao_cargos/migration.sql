-- Acrescenta CARGOS ao enum existente, preservando opções de migrations anteriores.
SELECT COLUMN_TYPE INTO @tipos_recurso
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'permissoes_usuario' AND COLUMN_NAME = 'recurso';
SET @ddl_cargos = IF(LOCATE('''CARGOS''', @tipos_recurso) > 0, 'SELECT 1',
  CONCAT('ALTER TABLE permissoes_usuario MODIFY recurso ',
    LEFT(@tipos_recurso, CHAR_LENGTH(@tipos_recurso) - 1), ',''CARGOS'') NOT NULL'));
PREPARE ddl_cargos FROM @ddl_cargos;
EXECUTE ddl_cargos;
DEALLOCATE PREPARE ddl_cargos;
