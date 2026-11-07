-- Incremento DB-first: aplicar depois de 20261031000000_eventos_apontamentos_producao.
-- Não altera apontamentos, eventos ou quantidades históricas. CHECKs e ascii_bin
-- precisam ser preservados pelo SQL (não são totalmente expressos pelo Prisma).
CREATE TABLE `producao_confirmacao` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_empresa` INT NOT NULL,
  `id_ordem_producao` INT NOT NULL,
  `id_ordem_producao_item` INT NOT NULL,
  `id_setor` INT NULL,
  `id_usuario` INT NOT NULL,
  `chave_idempotencia` VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `hash_requisicao` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `hash_estado` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tipo` ENUM('REGISTRO', 'CONFIRMACAO', 'LEGADO') NOT NULL,
  `quantidade_produzida` DECIMAL(15,3) NOT NULL,
  `quantidade_esperada` DECIMAL(15,3) NOT NULL,
  `id_apontamento_novo` INT NULL,
  `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_producao_confirmacao_chave` (`id_empresa`, `chave_idempotencia`),
  UNIQUE KEY `uk_producao_confirmacao_apontamento` (`id_apontamento_novo`),
  KEY `idx_producao_confirmacao_item` (`id_ordem_producao`, `id_ordem_producao_item`),
  CONSTRAINT `fk_producao_confirmacao_ordem` FOREIGN KEY (`id_empresa`, `id_ordem_producao`)
    REFERENCES `ordem_producao` (`id_empresa`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_producao_confirmacao_item` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`)
    REFERENCES `ordem_producao_item` (`id_ordem_producao`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_producao_confirmacao_setor` FOREIGN KEY (`id_ordem_producao`, `id_setor`)
    REFERENCES `ordem_producao_fluxo_setor` (`id_ordem_producao`, `id_setor`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_producao_confirmacao_usuario` FOREIGN KEY (`id_usuario`, `id_empresa`)
    REFERENCES `usuario_empresa` (`id_usuario`, `id_empresa`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_producao_confirmacao_apontamento` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id_apontamento_novo`)
    REFERENCES `ordem_producao_apontamento` (`id_ordem_producao`, `id_ordem_producao_item`, `id_setor`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_producao_confirmacao_quantidades` CHECK (`quantidade_produzida` >= 0 AND `quantidade_esperada` >= 0),
  CONSTRAINT `chk_producao_confirmacao_tipo` CHECK (
    (`tipo` = 'REGISTRO' AND `id_setor` IS NOT NULL AND `id_apontamento_novo` IS NOT NULL)
    OR (`tipo` = 'CONFIRMACAO' AND `id_setor` IS NOT NULL AND `id_apontamento_novo` IS NULL)
    OR (`tipo` = 'LEGADO' AND `id_setor` IS NULL AND `id_apontamento_novo` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
