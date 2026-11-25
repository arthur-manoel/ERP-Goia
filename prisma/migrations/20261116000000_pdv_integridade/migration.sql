-- Restaura a exclusão em cascata dos itens da venda, removida pela migration
-- 20261114152339_a ao reconstruir as FKs de item_venda.
SET @ensure_item_venda_cascade_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
     AND constraint_name = 'fk_item_venda_venda_empresa'
     AND constraint_type = 'FOREIGN KEY') = 0,
  'ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_venda_empresa` FOREIGN KEY (`id_empresa`, `id_venda`) REFERENCES `venda` (`id_empresa`, `id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE ensure_item_venda_cascade_stmt FROM @ensure_item_venda_cascade_sql;
EXECUTE ensure_item_venda_cascade_stmt;
DEALLOCATE PREPARE ensure_item_venda_cascade_stmt;

-- A chave avulsa baseada apenas no produto impedia duas variações distintas
-- do mesmo produto na mesma venda. A unicidade produto/variação e a validação
-- de duplicatas do pedido cobrem essa regra sem esse índice mais restritivo.
SET @drop_unique_item_venda_avulso_sql = IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'item_venda'
     AND index_name = 'uk_item_venda_produto_avulso') > 0,
  'ALTER TABLE `item_venda` DROP INDEX `uk_item_venda_produto_avulso`',
  'SELECT 1'
);
PREPARE drop_unique_item_venda_avulso_stmt FROM @drop_unique_item_venda_avulso_sql;
EXECUTE drop_unique_item_venda_avulso_stmt;
DEALLOCATE PREPARE drop_unique_item_venda_avulso_stmt;
