-- Restaura as FKs temporariamente removidas antes da migration 10/12.
-- Em bancos onde 10/12 já estava aplicada, cada constraint existente é mantida.

SET @ensure_fk_item_venda_empresa_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
     AND constraint_name = 'fk_item_venda_venda_empresa' AND constraint_type = 'FOREIGN KEY') = 0,
  'ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_venda_empresa` FOREIGN KEY (`id_empresa`, `id_venda`) REFERENCES `venda` (`id_empresa`, `id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE ensure_fk_item_venda_empresa_stmt FROM @ensure_fk_item_venda_empresa_sql;
EXECUTE ensure_fk_item_venda_empresa_stmt;
DEALLOCATE PREPARE ensure_fk_item_venda_empresa_stmt;

SET @drop_fk_item_venda_cor_cascade_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
      AND constraint_name = 'fk_item_venda_cor'
      AND update_rule NOT IN ('RESTRICT', 'NO ACTION')
  ),
  'ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_cor`',
  'SELECT 1'
);
PREPARE drop_fk_item_venda_cor_cascade_stmt FROM @drop_fk_item_venda_cor_cascade_sql;
EXECUTE drop_fk_item_venda_cor_cascade_stmt;
DEALLOCATE PREPARE drop_fk_item_venda_cor_cascade_stmt;

SET @ensure_fk_item_venda_cor_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
     AND constraint_name = 'fk_item_venda_cor' AND constraint_type = 'FOREIGN KEY') = 0,
  'ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_cor` FOREIGN KEY (`id_empresa`, `id_cor`) REFERENCES `cores` (`id_empresa`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE ensure_fk_item_venda_cor_stmt FROM @ensure_fk_item_venda_cor_sql;
EXECUTE ensure_fk_item_venda_cor_stmt;
DEALLOCATE PREPARE ensure_fk_item_venda_cor_stmt;

SET @drop_fk_item_venda_tamanho_cascade_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
    WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
      AND constraint_name = 'fk_item_venda_tamanho'
      AND update_rule NOT IN ('RESTRICT', 'NO ACTION')
  ),
  'ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_tamanho`',
  'SELECT 1'
);
PREPARE drop_fk_item_venda_tamanho_cascade_stmt FROM @drop_fk_item_venda_tamanho_cascade_sql;
EXECUTE drop_fk_item_venda_tamanho_cascade_stmt;
DEALLOCATE PREPARE drop_fk_item_venda_tamanho_cascade_stmt;

SET @ensure_fk_item_venda_tamanho_sql = IF(
  (SELECT COUNT(*) FROM information_schema.table_constraints
   WHERE constraint_schema = DATABASE() AND table_name = 'item_venda'
     AND constraint_name = 'fk_item_venda_tamanho' AND constraint_type = 'FOREIGN KEY') = 0,
  'ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_tamanho` FOREIGN KEY (`id_empresa`, `id_tamanho`) REFERENCES `tamanhos` (`id_empresa`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT',
  'SELECT 1'
);
PREPARE ensure_fk_item_venda_tamanho_stmt FROM @ensure_fk_item_venda_tamanho_sql;
EXECUTE ensure_fk_item_venda_tamanho_stmt;
DEALLOCATE PREPARE ensure_fk_item_venda_tamanho_stmt;
