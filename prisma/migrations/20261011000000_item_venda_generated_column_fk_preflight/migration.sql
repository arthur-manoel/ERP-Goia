-- A migration 20261012000000 adiciona colunas STORED em item_venda.
-- Para replay vazio, solta as FKs antes do rebuild da tabela; serão restauradas
-- por 20261012100000. Se 10/12 já foi aplicada, preserva as FKs existentes.

-- A tabela de histórico pode não existir durante o replay no banco sombra.
-- Consulte-a dinamicamente apenas quando ela estiver presente.
SET @integridade_venda_applied = 0;
SET @migration_history_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = '_prisma_migrations'
);
SET @integridade_venda_history_sql = IF(
  @migration_history_exists > 0,
  'SET @integridade_venda_applied = (SELECT COUNT(*) FROM `_prisma_migrations` WHERE `migration_name` = ''20261012000000_integridade_venda_empresa'' AND `finished_at` IS NOT NULL)',
  'SET @integridade_venda_applied = 0'
);
PREPARE integridade_venda_history_stmt FROM @integridade_venda_history_sql;
EXECUTE integridade_venda_history_stmt;
DEALLOCATE PREPARE integridade_venda_history_stmt;

SET @drop_item_venda_cor_sql = IF(
  @integridade_venda_applied = 0
    AND EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
        AND constraint_name = 'fk_item_venda_cor' AND constraint_type = 'FOREIGN KEY'
    ),
  'ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_cor`',
  'SELECT 1'
);
PREPARE drop_item_venda_cor_stmt FROM @drop_item_venda_cor_sql;
EXECUTE drop_item_venda_cor_stmt;
DEALLOCATE PREPARE drop_item_venda_cor_stmt;

SET @drop_item_venda_tamanho_sql = IF(
  @integridade_venda_applied = 0
    AND EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
        AND constraint_name = 'fk_item_venda_tamanho' AND constraint_type = 'FOREIGN KEY'
    ),
  'ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_tamanho`',
  'SELECT 1'
);
PREPARE drop_item_venda_tamanho_stmt FROM @drop_item_venda_tamanho_sql;
EXECUTE drop_item_venda_tamanho_stmt;
DEALLOCATE PREPARE drop_item_venda_tamanho_stmt;

