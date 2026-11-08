-- Em replay desde banco vazio, remove a FK da baseline antes da migration
-- 20261007000000_sigilo_clientes_pedidos remover o índice que ela usa.
-- Em bancos que já aplicaram a migration de 07/10, esta etapa vira no-op.

SET @sigilo_clientes_applied = (
  SELECT COUNT(*)
  FROM `_prisma_migrations`
  WHERE `migration_name` = '20261007000000_sigilo_clientes_pedidos'
    AND `finished_at` IS NOT NULL
);

SET @drop_item_venda_product_fk_sql = IF(
  @sigilo_clientes_applied = 0
    AND EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE constraint_schema = DATABASE()
        AND table_name = 'item_venda'
        AND constraint_name = 'fk_item_venda_produto'
        AND constraint_type = 'FOREIGN KEY'
    ),
  'ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_produto`',
  'SELECT 1'
);
PREPARE drop_item_venda_product_fk_stmt FROM @drop_item_venda_product_fk_sql;
EXECUTE drop_item_venda_product_fk_stmt;
DEALLOCATE PREPARE drop_item_venda_product_fk_stmt;

SET @ensure_item_venda_product_index_sql = IF(
  @sigilo_clientes_applied = 0
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = 'item_venda'
        AND index_name = 'fk_item_venda_produto'
    ),
  'ALTER TABLE `item_venda` ADD INDEX `fk_item_venda_produto` (`id_produto`)',
  'SELECT 1'
);
PREPARE ensure_item_venda_product_index_stmt FROM @ensure_item_venda_product_index_sql;
EXECUTE ensure_item_venda_product_index_stmt;
DEALLOCATE PREPARE ensure_item_venda_product_index_stmt;
