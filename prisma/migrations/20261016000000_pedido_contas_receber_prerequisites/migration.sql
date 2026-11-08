-- Pré-requisitos da migration 20261017000000_pedido_contas_receber.
-- Criadas antes dos ALTER TABLE para permitir replay desde banco vazio.
-- IF NOT EXISTS preserva tabelas já existentes em bancos em uso.

-- Alinha nomes legados antes da migration de fechamento, que referencia empresas.
SET @rename_empresa_prereq_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresa')
    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresas'),
  'RENAME TABLE `empresa` TO `empresas`',
  'SELECT 1'
);
PREPARE rename_empresa_prereq_stmt FROM @rename_empresa_prereq_sql;
EXECUTE rename_empresa_prereq_stmt;
DEALLOCATE PREPARE rename_empresa_prereq_stmt;

SET @rename_permissao_setor_prereq_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'permissao_setor')
    AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'permissoes_setor'),
  'RENAME TABLE `permissao_setor` TO `permissoes_setor`',
  'SELECT 1'
);
PREPARE rename_permissao_setor_prereq_stmt FROM @rename_permissao_setor_prereq_sql;
EXECUTE rename_permissao_setor_prereq_stmt;
DEALLOCATE PREPARE rename_permissao_setor_prereq_stmt;

-- CreateTable
CREATE TABLE IF NOT EXISTS `categoria_financeira` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `tipo` ENUM('RECEITA', 'DESPESA', 'AMBOS') NOT NULL DEFAULT 'AMBOS',
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_categoria_financeira_empresa`(`id_empresa`),
    UNIQUE INDEX `uk_categoria_financeira_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `contas_receber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_venda` INTEGER NOT NULL,
    `id_categoria` INTEGER NOT NULL,
    `numero_parcela` INTEGER NOT NULL DEFAULT 1,
    `total_parcelas` INTEGER NOT NULL DEFAULT 1,
    `descricao` VARCHAR(255) NULL,
    `data_lancamento` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data_vencimento` DATE NOT NULL,
    `valor_original` DECIMAL(15, 2) NOT NULL,
    `valor_desconto` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `valor_acrescimo` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `valor_final` DECIMAL(15, 2) NOT NULL,
    `situacao` ENUM('ABERTO', 'PARCIAL', 'PAGO', 'ATRASADO', 'CANCELADO') NOT NULL DEFAULT 'ABERTO',
    `observacao` TEXT NULL,
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data_atualizacao` DATETIME(3) NOT NULL,

    INDEX `idx_contas_receber_empresa`(`id_empresa`),
    INDEX `idx_contas_receber_venda`(`id_venda`),
    INDEX `idx_contas_receber_categoria`(`id_categoria`),
    INDEX `idx_contas_receber_vencimento`(`data_vencimento`),
    INDEX `idx_contas_receber_situacao`(`situacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pedido_cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_cliente` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_condicao_pagamento` INTEGER NULL,
    `id_endereco_entrega` INTEGER NULL,
    `numero` VARCHAR(50) NOT NULL,
    `referencia_cliente` VARCHAR(100) NULL,
    `status` ENUM('RASCUNHO', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ENTREGA', 'PARCIALMENTE_ENTREGUE', 'ENTREGUE', 'CONCLUIDO', 'CANCELADO') NOT NULL DEFAULT 'RASCUNHO',
    `canal_venda` ENUM('BALCAO', 'LOJA', 'ONLINE', 'WHATSAPP', 'TELEFONE', 'OUTRO') NOT NULL DEFAULT 'BALCAO',
    `data_pedido` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_confirmacao` DATETIME(0) NULL,
    `data_previsao_entrega` DATETIME(0) NULL,
    `data_conclusao` DATETIME(0) NULL,
    `data_cancelamento` DATETIME(0) NULL,
    `motivo_cancelamento` VARCHAR(255) NULL,
    `valor_subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_desconto` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_frete` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_acrescimo` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_total` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `destinatario` VARCHAR(150) NULL,
    `telefone_entrega` VARCHAR(30) NULL,
    `endereco_entrega` VARCHAR(255) NULL,
    `numero_entrega` VARCHAR(20) NULL,
    `complemento_entrega` VARCHAR(100) NULL,
    `bairro_entrega` VARCHAR(100) NULL,
    `cidade_entrega` VARCHAR(100) NULL,
    `estado_entrega` CHAR(2) NULL,
    `cep_entrega` VARCHAR(10) NULL,
    `referencia_entrega` VARCHAR(255) NULL,
    `observacao` TEXT NULL,
    `observacao_interna` TEXT NULL,
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_atualizacao` TIMESTAMP(0) NOT NULL,
    `versao` INTEGER NOT NULL DEFAULT 1,
    `chave_idempotencia` VARCHAR(128) NULL,
    `hash_requisicao` CHAR(64) NULL,

    INDEX `fk_pedido_cliente_cliente`(`id_cliente`),
    INDEX `fk_pedido_cliente_usuario`(`id_usuario`),
    INDEX `fk_pedido_cliente_condicao`(`id_condicao_pagamento`),
    INDEX `fk_pedido_cliente_endereco`(`id_endereco_entrega`),
    INDEX `idx_pedido_cliente_empresa_status`(`id_empresa`, `status`),
    INDEX `idx_pedido_cliente_empresa_data`(`id_empresa`, `data_pedido`),
    INDEX `idx_pedido_cliente_previsao`(`id_empresa`, `data_previsao_entrega`),
    UNIQUE INDEX `uk_pedido_cliente_empresa_numero`(`id_empresa`, `numero`),
    UNIQUE INDEX `uk_pedido_empresa_idempotencia`(`id_empresa`, `chave_idempotencia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pedido_cliente_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido_cliente` INTEGER NOT NULL,
    `numero_item` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `codigo_produto` VARCHAR(100) NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `unidade` VARCHAR(20) NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_unitario` DECIMAL(15, 2) NOT NULL,
    `valor_desconto` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_acrescimo` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_total` DECIMAL(15, 2) NOT NULL,
    `data_previsao_entrega` DATETIME(0) NULL,
    `observacao` TEXT NULL,
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_atualizacao` TIMESTAMP(0) NOT NULL,
    `id_variacao` INTEGER NULL,

    INDEX `fk_pedido_item_produto`(`id_produto`),
    INDEX `fk_pedido_item_cor`(`id_cor`),
    INDEX `fk_pedido_item_tamanho`(`id_tamanho`),
    INDEX `fk_pedido_item_variacao`(`id_variacao`),
    UNIQUE INDEX `uk_pedido_cliente_numero_item`(`id_pedido_cliente`, `numero_item`),
    UNIQUE INDEX `uk_pedido_item_id_pedido`(`id`, `id_pedido_cliente`),
    UNIQUE INDEX `uk_pedido_item_produto_variacao`(`id_pedido_cliente`, `id_produto`, `id_variacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Colunas DB-first esperadas pela migration de 17/10; adiciona somente se ausentes.
SET @add_venda_pedido_cliente = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'venda' AND column_name = 'id_pedido_cliente'),
  'SELECT 1',
  'ALTER TABLE venda ADD COLUMN id_pedido_cliente INTEGER NULL'
);
PREPARE add_venda_pedido_cliente_stmt FROM @add_venda_pedido_cliente;
EXECUTE add_venda_pedido_cliente_stmt;
DEALLOCATE PREPARE add_venda_pedido_cliente_stmt;

SET @add_item_venda_pedido_item = IF(
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'item_venda' AND column_name = 'id_pedido_cliente_item'),
  'SELECT 1',
  'ALTER TABLE item_venda ADD COLUMN id_pedido_cliente_item INTEGER NULL'
);
PREPARE add_item_venda_pedido_item_stmt FROM @add_item_venda_pedido_item;
EXECUTE add_item_venda_pedido_item_stmt;
DEALLOCATE PREPARE add_item_venda_pedido_item_stmt;
