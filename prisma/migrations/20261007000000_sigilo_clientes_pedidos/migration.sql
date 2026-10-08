-- Reforca isolamento de dados comerciais por empresa e registra a variacao
-- vendida em confecao (produto, cor e tamanho) em cada item do pedido.
-- A migration aborta com erro se os dados legados tiverem cruzamento de empresa.

ALTER TABLE `clientes`
  ADD UNIQUE INDEX `uk_cliente_empresa_id` (`id_empresa`, `id`);

ALTER TABLE `venda`
  ADD UNIQUE INDEX `uk_venda_empresa_id` (`id_empresa`, `id`);

ALTER TABLE `cores`
  ADD UNIQUE INDEX `uk_cor_empresa_id` (`id_empresa`, `id`);

ALTER TABLE `tamanhos`
  ADD UNIQUE INDEX `uk_tamanho_empresa_id` (`id_empresa`, `id`);

-- Corrige inconsistencias existentes antes de instalar as FKs compostas.
DELIMITER //
CREATE PROCEDURE `validar_isolamento_pedidos`()
BEGIN
  IF EXISTS (
    SELECT 1 FROM `venda` v
    INNER JOIN `clientes` c ON c.`id` = v.`id_cliente`
    WHERE c.`id_empresa` <> v.`id_empresa`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existem vendas vinculadas a clientes de outra empresa; corrija os dados antes da migration.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM `venda` v
    INNER JOIN `usuario_empresa` ue ON ue.`id_usuario` = v.`id_usuario`
    WHERE ue.`id_empresa` <> v.`id_empresa`
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existem vendas vinculadas a usuarios sem vinculo com a empresa da venda; corrija os dados antes da migration.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM `usuario_empresa` ue
    INNER JOIN `venda` v ON v.`id_usuario` = ue.`id_usuario` AND v.`id_empresa` = ue.`id_empresa`
    WHERE ue.`status` <> 'ATIVO'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Existem vendas registradas por vinculos de usuario inativos; revise os dados antes da migration.';
  END IF;

END//
DELIMITER ;

CALL `validar_isolamento_pedidos`();
DROP PROCEDURE `validar_isolamento_pedidos`;

-- Uma venda só pode referenciar cliente da mesma empresa.
ALTER TABLE `venda`
  DROP FOREIGN KEY `fk_venda_cliente`,
  DROP INDEX `fk_venda_cliente`,
  ADD INDEX `idx_venda_empresa_cliente` (`id_empresa`, `id_cliente`),
  ADD CONSTRAINT `fk_venda_cliente_empresa`
    FOREIGN KEY (`id_empresa`, `id_cliente`)
    REFERENCES `clientes` (`id_empresa`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- O usuário que registra a venda deve estar vinculado à empresa correspondente.
ALTER TABLE `usuario_empresa`
  ADD UNIQUE INDEX `uk_usuario_empresa_usuario_empresa` (`id_usuario`, `id_empresa`);

ALTER TABLE `venda`
  ADD INDEX `idx_venda_empresa_usuario` (`id_empresa`, `id_usuario`),
  ADD CONSTRAINT `fk_venda_usuario_empresa`
    FOREIGN KEY (`id_usuario`, `id_empresa`)
    REFERENCES `usuario_empresa` (`id_usuario`, `id_empresa`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- O endereço de entrega é um snapshot do pedido para manter histórico mesmo
-- se o cadastro do cliente for alterado posteriormente. Os campos são privados
-- no âmbito da empresa e devem respeitar as permissões de CLIENTES/VENDAS.
ALTER TABLE `venda`
  ADD COLUMN `entrega_nome_destinatario` VARCHAR(150) NULL,
  ADD COLUMN `entrega_telefone` VARCHAR(30) NULL,
  ADD COLUMN `entrega_endereco` VARCHAR(255) NULL,
  ADD COLUMN `entrega_numero` VARCHAR(20) NULL,
  ADD COLUMN `entrega_complemento` VARCHAR(100) NULL,
  ADD COLUMN `entrega_bairro` VARCHAR(100) NULL,
  ADD COLUMN `entrega_cidade` VARCHAR(100) NULL,
  ADD COLUMN `entrega_estado` CHAR(2) NULL,
  ADD COLUMN `entrega_cep` VARCHAR(10) NULL,
  ADD COLUMN `observacao_interna` TEXT NULL;

-- Detalhamento comercial e de confecção do item: permite vender cores/tamanhos
-- diferentes do mesmo produto em uma única venda. SET NULL preserva o histórico
-- caso uma variação seja removida logicamente ou o catálogo seja reorganizado.
ALTER TABLE `item_venda`
  DROP INDEX `uk_item_venda_produto`,
  ADD COLUMN `id_empresa` INTEGER NULL,
  ADD COLUMN `id_cor` INTEGER NULL,
  ADD COLUMN `id_tamanho` INTEGER NULL,
  ADD COLUMN `descricao` VARCHAR(255) NULL,
  ADD INDEX `fk_item_venda_cor` (`id_empresa`, `id_cor`),
  ADD INDEX `fk_item_venda_tamanho` (`id_empresa`, `id_tamanho`);

-- Preenche o tenant do item usando o pedido existente antes de torná-lo obrigatório.
UPDATE `item_venda` iv
INNER JOIN `venda` v ON v.`id` = iv.`id_venda`
SET iv.`id_empresa` = v.`id_empresa`;

ALTER TABLE `item_venda`
  MODIFY COLUMN `id_empresa` INTEGER NOT NULL,
  DROP INDEX `fk_item_venda_produto`,
  ADD UNIQUE INDEX `uk_item_venda_produto_variacao` (`id_empresa`, `id_venda`, `id_produto`, `id_cor`, `id_tamanho`),
  ADD INDEX `fk_item_venda_produto` (`id_produto`),
  ADD CONSTRAINT `fk_item_venda_venda_empresa`
    FOREIGN KEY (`id_empresa`, `id_venda`) REFERENCES `venda` (`id_empresa`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_item_venda_cor` FOREIGN KEY (`id_empresa`, `id_cor`) REFERENCES `cores` (`id_empresa`, `id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_item_venda_tamanho` FOREIGN KEY (`id_empresa`, `id_tamanho`) REFERENCES `tamanhos` (`id_empresa`, `id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `venda_parcelas` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_empresa` INTEGER NOT NULL,
  `id_venda` INTEGER NOT NULL,
  `numero_parcela` INTEGER NOT NULL,
  `valor` DECIMAL(15, 2) NOT NULL,
  `data_vencimento` DATE NOT NULL,
  `valor_pago` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `data_pagamento` DATETIME(0) NULL,
  `forma_pagamento` ENUM('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO') NULL,
  `referencia_pagamento` VARCHAR(100) NULL,
  `observacao` VARCHAR(255) NULL,
  `status` ENUM('ABERTA', 'PAGA', 'PARCIAL', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
  `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  UNIQUE INDEX `uk_venda_parcela_numero` (`id_empresa`, `id_venda`, `numero_parcela`),
  INDEX `idx_venda_parcela_vencimento` (`id_empresa`, `status`, `data_vencimento`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_venda_parcela_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_venda_parcela_venda` FOREIGN KEY (`id_empresa`, `id_venda`) REFERENCES `venda` (`id_empresa`, `id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `venda_status_historico` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `id_empresa` INTEGER NOT NULL,
  `id_venda` INTEGER NOT NULL,
  `id_usuario_empresa` INTEGER NULL,
  `status_anterior` ENUM('RASCUNHO', 'CONFIRMADA', 'SEPARACAO', 'FATURADA', 'ENVIADA', 'ENTREGUE', 'CANCELADA') NULL,
  `status_novo` ENUM('RASCUNHO', 'CONFIRMADA', 'SEPARACAO', 'FATURADA', 'ENVIADA', 'ENTREGUE', 'CANCELADA') NOT NULL,
  `observacao` VARCHAR(255) NULL,
  `data_evento` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  INDEX `idx_venda_historico_data` (`id_empresa`, `id_venda`, `data_evento`),
  INDEX `fk_venda_historico_usuario` (`id_usuario_empresa`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_venda_historico_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_venda_historico_venda` FOREIGN KEY (`id_empresa`, `id_venda`) REFERENCES `venda` (`id_empresa`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_venda_historico_usuario` FOREIGN KEY (`id_usuario_empresa`) REFERENCES `usuario_empresa` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
