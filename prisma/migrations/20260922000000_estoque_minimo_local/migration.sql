-- O mínimo passa a ser configurado por empresa, local de estoque e produto.
-- O índice composto permite que a FK valide também o pertencimento do local à empresa.
ALTER TABLE `locais_estoque`
  ADD UNIQUE INDEX `idx_local_estoque_empresa_id` (`id_empresa`, `id`);

CREATE TABLE `estoque_minimo_local` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_empresa` INTEGER NOT NULL,
  `id_local_estoque` INTEGER NOT NULL,
  `id_produto` INTEGER NOT NULL,
  `quantidade_minima` DECIMAL(15, 3) NOT NULL,
  `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `data_atualizacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `uk_estoque_minimo_empresa_local_produto` (`id_empresa`, `id_local_estoque`, `id_produto`),
  INDEX `idx_estoque_minimo_empresa_quantidade` (`id_empresa`, `quantidade_minima`),
  CONSTRAINT `fk_estoque_minimo_empresa`
    FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_estoque_minimo_local_empresa`
    FOREIGN KEY (`id_empresa`, `id_local_estoque`)
    REFERENCES `locais_estoque` (`id_empresa`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_estoque_minimo_produto_empresa`
    FOREIGN KEY (`id_empresa`, `id_produto`)
    REFERENCES `produto_empresa` (`id_empresa`, `id_produto`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Transição dos dados antigos: cada posição física existente herda uma única vez
-- o mínimo antes configurado em produto_empresa. Novas posições sem configuração
-- permanecem explicitamente sem mínimo e são sinalizadas pela aplicação.
INSERT INTO `estoque_minimo_local`
  (`id_empresa`, `id_local_estoque`, `id_produto`, `quantidade_minima`)
SELECT e.`id_empresa`, e.`id_local_estoque`, e.`id_produto`, pe.`estoque_minimo`
FROM `estoque` e
INNER JOIN `produto_empresa` pe
  ON pe.`id_empresa` = e.`id_empresa` AND pe.`id_produto` = e.`id_produto`;
