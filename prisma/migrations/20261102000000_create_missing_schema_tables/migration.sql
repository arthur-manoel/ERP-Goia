-- Adiciona os models presentes no schema.prisma e ausentes do histórico versionado.
-- DDL derivado do schema atual com prisma migrate diff; não aplica alterações ao banco.

-- Alinha nomes legados da base original com os nomes usados pelo Prisma.
-- Os comandos são condicionais para também permitir o replay após a baseline,
-- que já cria as tabelas com os nomes de destino.
SET @rename_empresa_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresa') AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'empresas'),
  'RENAME TABLE `empresa` TO `empresas`',
  'DO 0'
);
PREPARE rename_empresa_stmt FROM @rename_empresa_sql;
EXECUTE rename_empresa_stmt;
DEALLOCATE PREPARE rename_empresa_stmt;

SET @rename_permissao_setor_sql = IF(
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'permissao_setor') AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'permissoes_setor'),
  'RENAME TABLE `permissao_setor` TO `permissoes_setor`',
  'DO 0'
);
PREPARE rename_permissao_setor_stmt FROM @rename_permissao_setor_sql;
EXECUTE rename_permissao_setor_stmt;
DEALLOCATE PREPARE rename_permissao_setor_stmt;



-- CreateTable
CREATE TABLE IF NOT EXISTS `cliente_contato` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_cliente` INTEGER NOT NULL,
    `tipo` VARCHAR(30) NOT NULL,
    `valor` VARCHAR(150) NOT NULL,
    `descricao` VARCHAR(100) NULL,
    `principal` BOOLEAN NOT NULL DEFAULT false,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_cliente_contato_cliente`(`id_cliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `cliente_endereco` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_cliente` INTEGER NOT NULL,
    `tipo` ENUM('PRINCIPAL', 'ENTREGA', 'COBRANCA', 'OUTRO') NOT NULL DEFAULT 'PRINCIPAL',
    `descricao` VARCHAR(100) NULL,
    `endereco` VARCHAR(255) NOT NULL,
    `numero` VARCHAR(20) NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NULL,
    `cidade` VARCHAR(100) NULL,
    `estado` CHAR(2) NULL,
    `cep` VARCHAR(10) NULL,
    `referencia` VARCHAR(255) NULL,
    `principal` BOOLEAN NOT NULL DEFAULT false,
    `ativo` BOOLEAN NOT NULL DEFAULT true,
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_cliente_endereco_cliente`(`id_cliente`),
    INDEX `idx_cliente_endereco_tipo`(`id_cliente`, `tipo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `condicoes_pagamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `numero_parcelas` INTEGER NOT NULL DEFAULT 1,
    `intervalo_dias` INTEGER NOT NULL DEFAULT 0,
    `permite_parcelamento` BOOLEAN NOT NULL DEFAULT false,
    `permite_credito` BOOLEAN NOT NULL DEFAULT false,
    `desconto_percentual` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_condicao_pagamento_empresa`(`id_empresa`),
    UNIQUE INDEX `uk_condicao_pagamento_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `contas_bancarias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `banco` VARCHAR(100) NULL,
    `agencia` VARCHAR(20) NULL,
    `numero_conta` VARCHAR(30) NULL,
    `tipo` ENUM('CONTA_CORRENTE', 'CONTA_POUPANCA', 'CAIXA', 'CARTEIRA_DIGITAL', 'OUTRA') NOT NULL,
    `saldo_inicial` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_conta_bancaria_empresa`(`id_empresa`),
    UNIQUE INDEX `uk_conta_bancaria_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `contas_pagar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_compra` INTEGER NOT NULL,
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

    INDEX `idx_contas_pagar_empresa`(`id_empresa`),
    INDEX `idx_contas_pagar_compra`(`id_compra`),
    INDEX `idx_contas_pagar_categoria`(`id_categoria`),
    INDEX `idx_contas_pagar_vencimento`(`data_vencimento`),
    INDEX `idx_contas_pagar_situacao`(`situacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



-- CreateTable
CREATE TABLE IF NOT EXISTS `despesas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_categoria` INTEGER NOT NULL,
    `id_conta_pagar` INTEGER NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `data_despesa` DATE NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `situacao` ENUM('ABERTA', 'PAGA', 'CANCELADA') NOT NULL DEFAULT 'ABERTA',
    `observacao` TEXT NULL,
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data_atualizacao` DATETIME(3) NOT NULL,

    INDEX `idx_despesas_empresa`(`id_empresa`),
    INDEX `idx_despesas_categoria`(`id_categoria`),
    INDEX `idx_despesas_conta_pagar`(`id_conta_pagar`),
    INDEX `idx_despesas_data`(`data_despesa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `movimentacoes_financeiras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_conta_bancaria` INTEGER NOT NULL,
    `tipo` ENUM('ENTRADA', 'SAIDA') NOT NULL,
    `origem` ENUM('RECEBIMENTO', 'PAGAMENTO', 'DESPESA', 'AJUSTE', 'TRANSFERENCIA') NOT NULL,
    `id_pagamento_receber` INTEGER NULL,
    `id_pagamento_pagar` INTEGER NULL,
    `id_despesa` INTEGER NULL,
    `descricao` VARCHAR(255) NOT NULL,
    `valor` DECIMAL(15, 2) NOT NULL,
    `data_movimentacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `observacao` TEXT NULL,

    INDEX `idx_movimentacao_financeira_empresa`(`id_empresa`),
    INDEX `idx_movimentacao_financeira_conta`(`id_conta_bancaria`),
    INDEX `idx_movimentacao_financeira_data`(`data_movimentacao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pagamentos_pagar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_conta_pagar` INTEGER NOT NULL,
    `data_pagamento` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valor` DECIMAL(15, 2) NOT NULL,
    `forma_pagamento` ENUM('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO') NOT NULL,
    `observacao` VARCHAR(255) NULL,
    `status` ENUM('CONFIRMADO', 'CANCELADO') NOT NULL DEFAULT 'CONFIRMADO',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_pagamentos_pagar_empresa`(`id_empresa`),
    INDEX `idx_pagamentos_pagar_conta`(`id_conta_pagar`),
    INDEX `idx_pagamentos_pagar_data`(`data_pagamento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pagamentos_receber` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_conta_receber` INTEGER NOT NULL,
    `data_pagamento` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valor` DECIMAL(15, 2) NOT NULL,
    `forma_pagamento` ENUM('DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'BOLETO', 'TRANSFERENCIA', 'CHEQUE', 'OUTRO') NOT NULL,
    `observacao` VARCHAR(255) NULL,
    `status` ENUM('CONFIRMADO', 'CANCELADO') NOT NULL DEFAULT 'CONFIRMADO',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_pagamentos_receber_empresa`(`id_empresa`),
    INDEX `idx_pagamentos_receber_conta`(`id_conta_receber`),
    INDEX `idx_pagamentos_receber_data`(`data_pagamento`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



-- CreateTable
CREATE TABLE IF NOT EXISTS `pedido_cliente_entrega` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido_cliente` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `numero_entrega` INTEGER NOT NULL,
    `modalidade` ENUM('ENTREGA', 'RETIRADA') NOT NULL DEFAULT 'ENTREGA',
    `status` ENUM('PREPARANDO', 'ENVIADA', 'ENTREGUE', 'RECEBIMENTO_CONFIRMADO', 'NAO_ENTREGUE', 'CANCELADA') NOT NULL DEFAULT 'PREPARANDO',
    `transportadora` VARCHAR(150) NULL,
    `codigo_rastreamento` VARCHAR(100) NULL,
    `data_previsao` DATETIME(0) NULL,
    `data_envio` DATETIME(0) NULL,
    `data_entrega` DATETIME(0) NULL,
    `data_confirmacao_recebimento` DATETIME(0) NULL,
    `nome_recebedor` VARCHAR(150) NULL,
    `comprovante_url` VARCHAR(2048) NULL,
    `motivo_ocorrencia` VARCHAR(255) NULL,
    `observacao` TEXT NULL,
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_atualizacao` TIMESTAMP(0) NOT NULL,

    INDEX `fk_pedido_entrega_usuario`(`id_usuario`),
    INDEX `idx_pedido_entrega_status`(`id_pedido_cliente`, `status`),
    UNIQUE INDEX `uk_pedido_entrega_numero`(`id_pedido_cliente`, `numero_entrega`),
    UNIQUE INDEX `uk_pedido_entrega_id_pedido`(`id`, `id_pedido_cliente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pedido_cliente_entrega_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido_cliente` INTEGER NOT NULL,
    `id_pedido_cliente_entrega` INTEGER NOT NULL,
    `id_pedido_cliente_item` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,

    INDEX `idx_pedido_entrega_item_entrega`(`id_pedido_cliente_entrega`, `id_pedido_cliente`),
    INDEX `idx_pedido_entrega_item_item`(`id_pedido_cliente_item`, `id_pedido_cliente`),
    UNIQUE INDEX `uk_pedido_entrega_item`(`id_pedido_cliente_entrega`, `id_pedido_cliente_item`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pedido_cliente_historico` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido_cliente` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `status_anterior` ENUM('RASCUNHO', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ENTREGA', 'PARCIALMENTE_ENTREGUE', 'ENTREGUE', 'CONCLUIDO', 'CANCELADO') NULL,
    `status_novo` ENUM('RASCUNHO', 'CONFIRMADO', 'EM_PRODUCAO', 'PRONTO', 'EM_ENTREGA', 'PARCIALMENTE_ENTREGUE', 'ENTREGUE', 'CONCLUIDO', 'CANCELADO') NOT NULL,
    `observacao` TEXT NULL,
    `data_evento` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_pedido_historico_data`(`id_pedido_cliente`, `data_evento`),
    INDEX `fk_pedido_historico_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;



-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'categoria_financeira' AND constraint_name = 'categoria_financeira_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `categoria_financeira` ADD CONSTRAINT `categoria_financeira_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cliente_contato' AND constraint_name = 'cliente_contato_id_cliente_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `cliente_contato` ADD CONSTRAINT `cliente_contato_id_cliente_fkey` FOREIGN KEY (`id_cliente`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'cliente_endereco' AND constraint_name = 'cliente_endereco_id_cliente_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `cliente_endereco` ADD CONSTRAINT `cliente_endereco_id_cliente_fkey` FOREIGN KEY (`id_cliente`) REFERENCES `clientes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'condicoes_pagamento' AND constraint_name = 'condicoes_pagamento_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `condicoes_pagamento` ADD CONSTRAINT `condicoes_pagamento_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_bancarias' AND constraint_name = 'contas_bancarias_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_bancarias` ADD CONSTRAINT `contas_bancarias_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_id_compra_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_id_compra_fkey` FOREIGN KEY (`id_compra`) REFERENCES `compras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_id_categoria_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_pagar` ADD CONSTRAINT `contas_pagar_id_categoria_fkey` FOREIGN KEY (`id_categoria`) REFERENCES `categoria_financeira`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_receber' AND constraint_name = 'contas_receber_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_receber' AND constraint_name = 'contas_receber_id_venda_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_id_venda_fkey` FOREIGN KEY (`id_venda`) REFERENCES `venda`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_receber' AND constraint_name = 'contas_receber_id_categoria_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `contas_receber` ADD CONSTRAINT `contas_receber_id_categoria_fkey` FOREIGN KEY (`id_categoria`) REFERENCES `categoria_financeira`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'despesas' AND constraint_name = 'despesas_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `despesas` ADD CONSTRAINT `despesas_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'despesas' AND constraint_name = 'despesas_id_categoria_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `despesas` ADD CONSTRAINT `despesas_id_categoria_fkey` FOREIGN KEY (`id_categoria`) REFERENCES `categoria_financeira`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'despesas' AND constraint_name = 'despesas_id_conta_pagar_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `despesas` ADD CONSTRAINT `despesas_id_conta_pagar_fkey` FOREIGN KEY (`id_conta_pagar`) REFERENCES `contas_pagar`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'movimentacoes_financeiras' AND constraint_name = 'movimentacoes_financeiras_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `movimentacoes_financeiras` ADD CONSTRAINT `movimentacoes_financeiras_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'movimentacoes_financeiras' AND constraint_name = 'movimentacoes_financeiras_id_conta_bancaria_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `movimentacoes_financeiras` ADD CONSTRAINT `movimentacoes_financeiras_id_conta_bancaria_fkey` FOREIGN KEY (`id_conta_bancaria`) REFERENCES `contas_bancarias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'movimentacoes_financeiras' AND constraint_name = 'movimentacoes_financeiras_id_pagamento_receber_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `movimentacoes_financeiras` ADD CONSTRAINT `movimentacoes_financeiras_id_pagamento_receber_fkey` FOREIGN KEY (`id_pagamento_receber`) REFERENCES `pagamentos_receber`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'movimentacoes_financeiras' AND constraint_name = 'movimentacoes_financeiras_id_pagamento_pagar_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `movimentacoes_financeiras` ADD CONSTRAINT `movimentacoes_financeiras_id_pagamento_pagar_fkey` FOREIGN KEY (`id_pagamento_pagar`) REFERENCES `pagamentos_pagar`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'movimentacoes_financeiras' AND constraint_name = 'movimentacoes_financeiras_id_despesa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `movimentacoes_financeiras` ADD CONSTRAINT `movimentacoes_financeiras_id_despesa_fkey` FOREIGN KEY (`id_despesa`) REFERENCES `despesas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pagamentos_pagar' AND constraint_name = 'pagamentos_pagar_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pagamentos_pagar` ADD CONSTRAINT `pagamentos_pagar_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pagamentos_pagar' AND constraint_name = 'pagamentos_pagar_id_conta_pagar_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pagamentos_pagar` ADD CONSTRAINT `pagamentos_pagar_id_conta_pagar_fkey` FOREIGN KEY (`id_conta_pagar`) REFERENCES `contas_pagar`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pagamentos_receber' AND constraint_name = 'pagamentos_receber_id_empresa_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pagamentos_receber` ADD CONSTRAINT `pagamentos_receber_id_empresa_fkey` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pagamentos_receber' AND constraint_name = 'pagamentos_receber_id_conta_receber_fkey' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pagamentos_receber` ADD CONSTRAINT `pagamentos_receber_id_conta_receber_fkey` FOREIGN KEY (`id_conta_receber`) REFERENCES `contas_receber`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente' AND constraint_name = 'fk_pedido_cliente_empresa' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente` ADD CONSTRAINT `fk_pedido_cliente_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente' AND constraint_name = 'fk_pedido_cliente_cliente' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente` ADD CONSTRAINT `fk_pedido_cliente_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente' AND constraint_name = 'fk_pedido_cliente_usuario' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente` ADD CONSTRAINT `fk_pedido_cliente_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente' AND constraint_name = 'fk_pedido_cliente_condicao' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente` ADD CONSTRAINT `fk_pedido_cliente_condicao` FOREIGN KEY (`id_condicao_pagamento`) REFERENCES `condicoes_pagamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente' AND constraint_name = 'fk_pedido_cliente_endereco' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente` ADD CONSTRAINT `fk_pedido_cliente_endereco` FOREIGN KEY (`id_endereco_entrega`) REFERENCES `cliente_endereco`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_entrega' AND constraint_name = 'fk_pedido_entrega_pedido' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_entrega` ADD CONSTRAINT `fk_pedido_entrega_pedido` FOREIGN KEY (`id_pedido_cliente`) REFERENCES `pedido_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_entrega' AND constraint_name = 'fk_pedido_entrega_usuario' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_entrega` ADD CONSTRAINT `fk_pedido_entrega_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_entrega_item' AND constraint_name = 'fk_pedido_entrega_item_entrega' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_entrega_item` ADD CONSTRAINT `fk_pedido_entrega_item_entrega` FOREIGN KEY (`id_pedido_cliente_entrega`, `id_pedido_cliente`) REFERENCES `pedido_cliente_entrega`(`id`, `id_pedido_cliente`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_entrega_item' AND constraint_name = 'fk_pedido_entrega_item_item' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_entrega_item` ADD CONSTRAINT `fk_pedido_entrega_item_item` FOREIGN KEY (`id_pedido_cliente_item`, `id_pedido_cliente`) REFERENCES `pedido_cliente_item`(`id`, `id_pedido_cliente`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_historico' AND constraint_name = 'fk_pedido_historico_pedido' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_historico` ADD CONSTRAINT `fk_pedido_historico_pedido` FOREIGN KEY (`id_pedido_cliente`) REFERENCES `pedido_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_historico' AND constraint_name = 'fk_pedido_historico_usuario' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_historico` ADD CONSTRAINT `fk_pedido_historico_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_item' AND constraint_name = 'fk_pedido_item_pedido' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_item` ADD CONSTRAINT `fk_pedido_item_pedido` FOREIGN KEY (`id_pedido_cliente`) REFERENCES `pedido_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_item' AND constraint_name = 'fk_pedido_item_produto' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_item` ADD CONSTRAINT `fk_pedido_item_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_item' AND constraint_name = 'fk_pedido_item_cor' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_item` ADD CONSTRAINT `fk_pedido_item_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_item' AND constraint_name = 'fk_pedido_item_tamanho' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_item` ADD CONSTRAINT `fk_pedido_item_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;

-- AddForeignKey
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'pedido_cliente_item' AND constraint_name = 'fk_pedido_item_variacao' AND constraint_type = 'FOREIGN KEY');
SET @fk_sql = IF(@fk_exists = 0, 'ALTER TABLE `pedido_cliente_item` ADD CONSTRAINT `fk_pedido_item_variacao` FOREIGN KEY (`id_variacao`) REFERENCES `produto_variacoes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE fk_stmt FROM @fk_sql;
EXECUTE fk_stmt;
DEALLOCATE PREPARE fk_stmt;
