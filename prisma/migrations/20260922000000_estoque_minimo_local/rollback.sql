-- Rollback local validado: remove somente os objetos criados por esta entrega.
DROP TABLE IF EXISTS `estoque_minimo_local`;

ALTER TABLE `locais_estoque`
  DROP INDEX `idx_local_estoque_empresa_id`;
