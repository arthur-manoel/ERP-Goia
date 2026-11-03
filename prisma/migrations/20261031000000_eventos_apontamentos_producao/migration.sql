-- Extensão do modelo REAL publicado em 20261023000000. Não converte legados.
-- Conferir SHOW CREATE TABLE antes de aplicar; aprovação DB-first no compartilhado.
ALTER TABLE `ordem_producao`
  ADD UNIQUE INDEX `uk_op_empresa_id` (`id_empresa`, `id`);
ALTER TABLE `ordem_producao_fluxo_setor`
  ADD UNIQUE INDEX `uk_op_etapa_id_setor` (`id_ordem_producao`, `id`, `id_setor`);
ALTER TABLE `ordem_producao_apontamento`
  ADD UNIQUE INDEX `uk_apontamento_ordem_item_setor_id`
    (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id`);

CREATE TABLE `producao_apontamento_evento` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_empresa` INT NOT NULL,
  `id_ordem_producao` INT NOT NULL,
  `id_etapa` INT NOT NULL,
  `id_ordem_producao_item` INT NOT NULL,
  `id_setor` INT NOT NULL,
  `id_usuario` INT NOT NULL,
  `chave_idempotencia` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `hash_requisicao` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tipo` ENUM('REGISTRO', 'CORRECAO', 'ESTORNO') NOT NULL,
  `id_apontamento_novo` INT NULL,
  `id_apontamento_anterior` INT NULL,
  `motivo` VARCHAR(255) NULL,
  `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_apontamento_evento_chave` (`id_empresa`, `chave_idempotencia`),
  UNIQUE KEY `uk_apontamento_evento_novo` (`id_apontamento_novo`),
  UNIQUE KEY `uk_apontamento_evento_anterior` (`id_apontamento_anterior`),
  KEY `idx_apontamento_evento_historico` (`id_empresa`, `id_ordem_producao`, `data_cadastro`),
  CONSTRAINT `fk_apontamento_evento_ordem` FOREIGN KEY (`id_empresa`, `id_ordem_producao`)
    REFERENCES `ordem_producao` (`id_empresa`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_apontamento_evento_etapa` FOREIGN KEY (`id_ordem_producao`, `id_etapa`, `id_setor`)
    REFERENCES `ordem_producao_fluxo_setor` (`id_ordem_producao`, `id`, `id_setor`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_apontamento_evento_item` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`)
    REFERENCES `ordem_producao_item` (`id_ordem_producao`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_apontamento_evento_usuario_empresa` FOREIGN KEY (`id_usuario`, `id_empresa`)
    REFERENCES `usuario_empresa` (`id_usuario`, `id_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_apontamento_evento_novo` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id_apontamento_novo`)
    REFERENCES `ordem_producao_apontamento` (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_apontamento_evento_anterior` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id_apontamento_anterior`)
    REFERENCES `ordem_producao_apontamento` (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_apontamento_evento_tipo` CHECK (
    (`tipo` = 'REGISTRO' AND `id_apontamento_novo` IS NOT NULL AND `id_apontamento_anterior` IS NULL AND `motivo` IS NULL)
    OR (`tipo` = 'CORRECAO' AND `id_apontamento_novo` IS NOT NULL AND `id_apontamento_anterior` IS NOT NULL
      AND `id_apontamento_novo` <> `id_apontamento_anterior` AND `motivo` IS NOT NULL AND CHAR_LENGTH(TRIM(`motivo`)) > 0)
    OR (`tipo` = 'ESTORNO' AND `id_apontamento_novo` IS NULL AND `id_apontamento_anterior` IS NOT NULL
      AND `motivo` IS NOT NULL AND CHAR_LENGTH(TRIM(`motivo`)) > 0)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
