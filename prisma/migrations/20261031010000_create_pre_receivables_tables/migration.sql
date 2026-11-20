-- Tables first introduced by the later missing-schema repair are required by
-- the 20261101 incremental migrations. Create their structures before those
-- migrations run; the later repair migration adds their foreign keys.

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
