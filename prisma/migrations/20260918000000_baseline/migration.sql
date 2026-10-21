-- CreateTable
CREATE TABLE `administradores_gerais` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `senha_hash` VARCHAR(255) NOT NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_administrador_geral_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditoria` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NULL,
    `id_usuario` INTEGER NULL,
    `tabela` VARCHAR(100) NOT NULL,
    `id_registro` INTEGER NULL,
    `acao` ENUM('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT') NOT NULL,
    `dados_anteriores` TEXT NULL,
    `dados_novos` TEXT NULL,
    `ip` VARCHAR(45) NULL,
    `data_evento` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_auditoria_empresa`(`id_empresa`),
    INDEX `fk_auditoria_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cargos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    UNIQUE INDEX `uk_cargo_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NULL,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',

    UNIQUE INDEX `uk_categoria_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome_razao_social` VARCHAR(150) NOT NULL,
    `cpf_cnpj` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `telefone` VARCHAR(30) NULL,
    `endereco` VARCHAR(255) NULL,
    `numero` VARCHAR(20) NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NULL,
    `cidade` VARCHAR(100) NULL,
    `estado` CHAR(2) NULL,
    `cep` VARCHAR(10) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_cliente_empresa`(`id_empresa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compra_itens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_compra` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_unitario` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_total` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,

    INDEX `fk_compra_item_cor`(`id_cor`),
    INDEX `fk_compra_item_produto`(`id_produto`),
    INDEX `fk_compra_item_tamanho`(`id_tamanho`),
    UNIQUE INDEX `uk_compra_item_produto_variacao`(`id_compra`, `id_produto`, `id_cor`, `id_tamanho`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compras` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NOT NULL,
    `id_fornecedor` INTEGER NOT NULL,
    `id_ordem_producao` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_pedido_compra_legado` INTEGER NULL,
    `codigo` VARCHAR(50) NOT NULL,
    `origem` ENUM('MANUAL', 'ORDEM_PRODUCAO') NOT NULL DEFAULT 'MANUAL',
    `status` ENUM('RASCUNHO', 'EMITIDA', 'ENTREGUE', 'CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
    `data_emissao` DATETIME(0) NOT NULL,
    `observacao` VARCHAR(255) NULL,
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_atualizacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_compra_pedido_legado`(`id_pedido_compra_legado`),
    INDEX `fk_compra_estoque`(`id_local_estoque`),
    INDEX `fk_compra_fornecedor`(`id_fornecedor`),
    INDEX `fk_compra_op`(`id_ordem_producao`),
    INDEX `fk_compra_usuario`(`id_usuario`),
    INDEX `idx_compra_empresa_status`(`id_empresa`, `status`),
    UNIQUE INDEX `uk_compra_empresa_codigo`(`id_empresa`, `codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consumo_producao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_necessidade_producao` INTEGER NOT NULL,
    `id_reserva_estoque` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_setor` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `data_consumo` DATETIME(0) NULL,
    `id_usuario` INTEGER NOT NULL,

    INDEX `fk_consumo_necessidade`(`id_necessidade_producao`),
    INDEX `fk_consumo_op`(`id_ordem_producao`),
    INDEX `fk_consumo_produto`(`id_produto`),
    INDEX `fk_consumo_reserva`(`id_reserva_estoque`),
    INDEX `fk_consumo_setor`(`id_setor`),
    INDEX `fk_consumo_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NULL,
    `nome` VARCHAR(100) NOT NULL,
    `codigo_hex` VARCHAR(7) NULL,
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',

    UNIQUE INDEX `uk_cor_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empresa_fornecedor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_fornecedor` INTEGER NOT NULL,
    `prazo_pagamento` INTEGER NULL,
    `prazo_entrega` INTEGER NULL,
    `observacao` VARCHAR(255) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    INDEX `fk_empresa_fornecedor_fornecedor`(`id_fornecedor`),
    UNIQUE INDEX `uk_empresa_fornecedor`(`id_empresa`, `id_fornecedor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `empresas` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `razao_social` VARCHAR(150) NOT NULL,
    `nome_fantasia` VARCHAR(150) NULL,
    `cnpj` VARCHAR(18) NOT NULL,
    `inscricao_estadual` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `telefone` VARCHAR(30) NULL,
    `endereco` VARCHAR(255) NULL,
    `numero` VARCHAR(20) NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NULL,
    `cidade` VARCHAR(100) NULL,
    `estado` CHAR(2) NULL,
    `cep` VARCHAR(10) NULL,
    `logo_url` LONGTEXT NULL,
    `cor_tema` VARCHAR(50) NOT NULL DEFAULT '#22c55e',
    `status` ENUM('ATIVA', 'INATIVA') NOT NULL DEFAULT 'ATIVA',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_empresa_cnpj`(`cnpj`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `estoque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NOT NULL,
    `id_setor` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `quantidade_reservada` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `data_atualizacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_estoque_local`(`id_local_estoque`),
    INDEX `fk_estoque_produto`(`id_produto`),
    INDEX `fk_estoque_setor`(`id_setor`),
    UNIQUE INDEX `uk_estoque_empresa_local_produto`(`id_empresa`, `id_local_estoque`, `id_produto`),
    UNIQUE INDEX `uk_estoque_empresa_setor_produto`(`id_empresa`, `id_setor`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ficha_tecnica` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `versao` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('RASCUNHO', 'ATIVA', 'INATIVA') NOT NULL DEFAULT 'RASCUNHO',
    `data_vigencia` DATE NULL,

    INDEX `fk_ficha_produto`(`id_produto`),
    UNIQUE INDEX `uk_ficha_produto_versao`(`id_empresa`, `id_produto`, `versao`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ficha_tecnica_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ficha_tecnica` INTEGER NOT NULL,
    `id_produto_componente` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `perda_percentual` DECIMAL(5, 2) NOT NULL DEFAULT 0.00,

    INDEX `fk_ficha_item_componente`(`id_produto_componente`),
    UNIQUE INDEX `uk_ficha_item_componente`(`id_ficha_tecnica`, `id_produto_componente`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fornecedores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NULL,
    `razao_social` VARCHAR(150) NOT NULL,
    `nome_fantasia` VARCHAR(150) NULL,
    `cnpj` VARCHAR(18) NULL,
    `inscricao_estadual` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `telefone` VARCHAR(30) NULL,
    `endereco` VARCHAR(255) NULL,
    `numero` VARCHAR(20) NULL,
    `complemento` VARCHAR(100) NULL,
    `bairro` VARCHAR(100) NULL,
    `cidade` VARCHAR(100) NULL,
    `estado` CHAR(2) NULL,
    `cep` VARCHAR(10) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_fornecedor_empresa_cnpj`(`id_empresa`, `cnpj`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_nota_fiscal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_nota_fiscal` INTEGER NOT NULL,
    `numero_item` INTEGER NOT NULL,
    `id_produto` INTEGER NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `codigo_produto` VARCHAR(100) NULL,
    `descricao_produto` VARCHAR(255) NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `unidade` VARCHAR(20) NOT NULL,
    `tipo_valor` ENUM('UNITARIO', 'METRO', 'TOTAL') NOT NULL DEFAULT 'UNITARIO',
    `valor_unitario` DECIMAL(15, 2) NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL,
    `produto_cadastrado_automaticamente` BOOLEAN NOT NULL DEFAULT false,

    INDEX `fk_item_nf_cor`(`id_cor`),
    INDEX `fk_item_nf_produto`(`id_produto`),
    INDEX `fk_item_nf_tamanho`(`id_tamanho`),
    UNIQUE INDEX `uk_item_nf`(`id_nota_fiscal`, `numero_item`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_pedido_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_pedido_compra` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_unitario` DECIMAL(15, 2) NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL,

    INDEX `fk_item_pedido_compra_pedido`(`id_pedido_compra`),
    INDEX `fk_item_pedido_compra_produto`(`id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_requisicao_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_requisicao_compra` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_item_req_compra_produto`(`id_produto`),
    UNIQUE INDEX `uk_item_req_compra_produto`(`id_requisicao_compra`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_venda` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_venda` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_unitario` DECIMAL(15, 2) NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL,

    INDEX `fk_item_venda_produto`(`id_produto`),
    UNIQUE INDEX `uk_item_venda_produto`(`id_venda`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kardex` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_setor` INTEGER NULL,
    `id_produto` INTEGER NOT NULL,
    `id_movimentacao` INTEGER NOT NULL,
    `tipo_movimentacao` ENUM('ENTRADA', 'SAIDA') NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `saldo_anterior` DECIMAL(15, 3) NOT NULL,
    `saldo_atual` DECIMAL(15, 3) NOT NULL,
    `data_movimentacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_kardex_movimentacao`(`id_movimentacao`),
    INDEX `fk_kardex_empresa`(`id_empresa`),
    INDEX `fk_kardex_local`(`id_local_estoque`),
    INDEX `fk_kardex_produto`(`id_produto`),
    INDEX `fk_kardex_setor`(`id_setor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locais_estoque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    UNIQUE INDEX `uk_local_estoque_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimentacao_estoque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_setor` INTEGER NULL,
    `id_produto` INTEGER NOT NULL,
    `tipo` ENUM('ENTRADA_NF', 'SAIDA_VENDA', 'ENTRADA_PRODUCAO', 'SAIDA_PRODUCAO', 'AJUSTE_ENTRADA', 'AJUSTE_SAIDA', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA') NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `origem_tipo` VARCHAR(50) NULL,
    `origem_id` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `data_movimentacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_mov_estoque_empresa`(`id_empresa`),
    INDEX `fk_mov_estoque_local`(`id_local_estoque`),
    INDEX `fk_mov_estoque_produto`(`id_produto`),
    INDEX `fk_mov_estoque_setor`(`id_setor`),
    INDEX `fk_mov_estoque_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `necessidade_producao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `quantidade_necessaria` DECIMAL(15, 3) NOT NULL,
    `quantidade_reservada` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `quantidade_consumida` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `status` ENUM('PENDENTE', 'PARCIAL', 'RESERVADA', 'CONSUMIDA', 'CANCELADA') NOT NULL DEFAULT 'PENDENTE',

    INDEX `fk_necessidade_produto`(`id_produto`),
    UNIQUE INDEX `uk_necessidade_op_produto`(`id_ordem_producao`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nota_fiscal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_fornecedor` INTEGER NOT NULL,
    `id_pedido_compra` INTEGER NULL,
    `id_compra` INTEGER NULL,
    `id_setor_destino` INTEGER NULL,
    `numero` VARCHAR(30) NOT NULL,
    `serie` VARCHAR(10) NOT NULL,
    `chave_acesso` VARCHAR(44) NOT NULL,
    `status` ENUM('PENDENTE', 'RECEBIDA', 'CANCELADA') NOT NULL DEFAULT 'PENDENTE',
    `data_emissao` DATETIME(0) NULL,
    `data_recebimento` DATETIME(0) NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `entrada_processada` BOOLEAN NOT NULL DEFAULT false,
    `data_processamento` DATETIME(0) NULL,
    `observacao` VARCHAR(255) NULL,

    UNIQUE INDEX `uk_nf_chave_acesso`(`chave_acesso`),
    INDEX `fk_nf_setor_destino`(`id_setor_destino`),
    INDEX `fk_nota_fiscal_compra`(`id_compra`),
    INDEX `fk_nota_fiscal_fornecedor`(`id_fornecedor`),
    INDEX `fk_nota_fiscal_local`(`id_local_estoque`),
    INDEX `fk_nota_fiscal_pedido`(`id_pedido_compra`),
    UNIQUE INDEX `uk_nf_empresa_numero_serie`(`id_empresa`, `numero`, `serie`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `id_setor` INTEGER NULL,
    `numero` VARCHAR(50) NOT NULL,
    `prioridade` ENUM('BAIXA', 'NORMAL', 'ALTA', 'URGENTE') NOT NULL DEFAULT 'NORMAL',
    `quantidade_planejada` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `status` ENUM('PLANEJADA', 'AGUARDANDO_MATERIAL', 'LIBERADA', 'EM_PRODUCAO', 'PAUSADA', 'CONCLUIDA', 'CANCELADA') NOT NULL DEFAULT 'PLANEJADA',
    `data_inicio` DATETIME(0) NULL,
    `data_previsao` DATETIME(0) NULL,
    `data_conclusao` DATETIME(0) NULL,
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_op_setor`(`id_setor`),
    INDEX `fk_ordem_producao_local`(`id_local_estoque`),
    INDEX `fk_ordem_producao_usuario`(`id_usuario`),
    UNIQUE INDEX `uk_ordem_producao_empresa_numero`(`id_empresa`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_consumo_planejado` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_ordem_producao_item` INTEGER NOT NULL,
    `id_materia_prima` INTEGER NOT NULL,
    `quantidade_por_peca` DECIMAL(15, 3) NOT NULL,
    `quantidade_necessaria` DECIMAL(15, 3) NOT NULL,
    `quantidade_disponivel` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `quantidade_faltante` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,

    INDEX `fk_op_consumo_materia`(`id_materia_prima`),
    INDEX `fk_op_consumo_ordem`(`id_ordem_producao`),
    UNIQUE INDEX `uk_op_consumo_item_materia`(`id_ordem_producao_item`, `id_materia_prima`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_fluxo_setor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_setor` INTEGER NOT NULL,
    `ordem` INTEGER NOT NULL,

    INDEX `fk_op_fluxo_setor`(`id_setor`),
    UNIQUE INDEX `uk_op_fluxo_ordem`(`id_ordem_producao`, `ordem`),
    UNIQUE INDEX `uk_op_fluxo_setor`(`id_ordem_producao`, `id_setor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `tamanho` VARCHAR(30) NOT NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `quantidade_produzida` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,

    INDEX `fk_op_item_cor`(`id_cor`),
    INDEX `fk_op_item_ordem`(`id_ordem_producao`),
    INDEX `fk_op_item_produto`(`id_produto`),
    INDEX `fk_op_item_tamanho`(`id_tamanho`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_movimentacao_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_movimentacao` INTEGER NOT NULL,
    `id_ordem_producao_item` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 2) NOT NULL,

    INDEX `idx_op_mov_item_op`(`id_ordem_producao_item`),
    UNIQUE INDEX `uk_op_mov_item`(`id_movimentacao`, `id_ordem_producao_item`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_movimentacao_setor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_setor_origem` INTEGER NULL,
    `id_setor_destino` INTEGER NOT NULL,
    `quantidade` DECIMAL(15, 2) NULL,
    `id_usuario_envio` INTEGER NULL,
    `id_usuario_recebimento` INTEGER NULL,
    `status` ENUM('EM_TRANSITO', 'ENTREGUE') NOT NULL DEFAULT 'ENTREGUE',
    `data_envio` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_recebimento` DATETIME(0) NULL,
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_op_movimentacao_destino`(`id_setor_destino`),
    INDEX `fk_op_movimentacao_origem`(`id_setor_origem`),
    INDEX `fk_op_movimentacao_usuario_envio`(`id_usuario_envio`),
    INDEX `fk_op_movimentacao_usuario_recebimento`(`id_usuario_recebimento`),
    INDEX `idx_op_movimentacao_ordem`(`id_ordem_producao`, `data_envio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pedido_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_fornecedor` INTEGER NOT NULL,
    `id_requisicao_compra` INTEGER NULL,
    `id_ordem_producao` INTEGER NULL,
    `id_usuario` INTEGER NOT NULL,
    `numero` VARCHAR(50) NOT NULL,
    `data_pedido` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` ENUM('RASCUNHO', 'EMITIDO', 'PARCIAL', 'RECEBIDO', 'CANCELADO') NOT NULL DEFAULT 'RASCUNHO',
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_pedido_compra_fornecedor`(`id_fornecedor`),
    INDEX `fk_pedido_compra_op`(`id_ordem_producao`),
    INDEX `fk_pedido_compra_requisicao`(`id_requisicao_compra`),
    INDEX `fk_pedido_compra_usuario`(`id_usuario`),
    UNIQUE INDEX `uk_pedido_compra_empresa_numero`(`id_empresa`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissoes_setor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_setor` INTEGER NOT NULL,
    `recurso` VARCHAR(100) NOT NULL,

    UNIQUE INDEX `uk_permissao_setor_recurso`(`id_setor`, `recurso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissoes_usuario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario_empresa` INTEGER NOT NULL,
    `recurso` ENUM('PRODUTOS', 'ESTOQUE', 'NOTAS_FISCAIS', 'ORDENS_PRODUCAO', 'CORES', 'MODELOS', 'CATEGORIAS', 'CLIENTES') NOT NULL,
    `pode_ler` BOOLEAN NOT NULL DEFAULT false,
    `pode_criar` BOOLEAN NOT NULL DEFAULT false,
    `pode_editar` BOOLEAN NOT NULL DEFAULT false,
    `pode_excluir` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `uk_permissao_usuario_recurso`(`id_usuario_empresa`, `recurso`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_empresa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `codigo_interno` VARCHAR(100) NULL,
    `preco_venda` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `custo_atual` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `valor_estoque_atual` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `estoque_minimo` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `unidade_estoque_minimo` VARCHAR(20) NOT NULL DEFAULT 'UNIDADE',
    `estoque_maximo` DECIMAL(15, 3) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    INDEX `fk_produto_empresa_cor`(`id_cor`),
    INDEX `fk_produto_empresa_produto`(`id_produto`),
    INDEX `fk_produto_empresa_tamanho`(`id_tamanho`),
    UNIQUE INDEX `uk_codigo_interno_empresa`(`id_empresa`, `codigo_interno`),
    UNIQUE INDEX `uk_produto_empresa`(`id_empresa`, `id_produto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_fornecedor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_fornecedor` INTEGER NOT NULL,
    `codigo_produto_fornecedor` VARCHAR(100) NULL,
    `preco_ultima_compra` DECIMAL(15, 2) NULL,
    `prazo_entrega_dias` INTEGER NULL,
    `quantidade_minima` DECIMAL(15, 3) NULL,
    `fornecedor_principal` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    INDEX `fk_produto_fornecedor_fornecedor`(`id_fornecedor`),
    INDEX `fk_produto_fornecedor_produto`(`id_produto`),
    UNIQUE INDEX `uk_produto_fornecedor`(`id_empresa`, `id_produto`, `id_fornecedor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_variacoes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_cor` INTEGER NULL,
    `id_tamanho` INTEGER NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    INDEX `fk_produto_variacao_cor`(`id_cor`),
    INDEX `fk_produto_variacao_produto`(`id_produto`),
    INDEX `fk_produto_variacao_tamanho`(`id_tamanho`),
    UNIQUE INDEX `uk_produto_variacao`(`id_empresa`, `id_produto`, `id_cor`, `id_tamanho`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produtos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_tipo_produto` INTEGER NOT NULL,
    `id_categoria` INTEGER NULL,
    `nome` VARCHAR(150) NOT NULL,
    `codigo` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `unidade` VARCHAR(20) NOT NULL DEFAULT 'UN',
    `controla_estoque` BOOLEAN NOT NULL DEFAULT true,
    `permite_venda` BOOLEAN NOT NULL DEFAULT false,
    `permite_compra` BOOLEAN NOT NULL DEFAULT false,
    `permite_producao` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_produtos_tipo`(`id_tipo_produto`),
    INDEX `idx_produto_categoria`(`id_categoria`),
    INDEX `idx_produto_codigo`(`codigo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `data_criacao` DATETIME(0) NOT NULL,
    `data_expiracao` DATETIME(0) NOT NULL,
    `revogado` BOOLEAN NOT NULL DEFAULT false,
    `data_revogacao` DATETIME(0) NULL,
    `ip` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,

    UNIQUE INDEX `uk_refresh_token`(`token`),
    INDEX `idx_refresh_expiracao`(`data_expiracao`),
    INDEX `idx_refresh_usuario`(`id_usuario`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `requisicao_compra` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_setor_solicitante` INTEGER NULL,
    `id_usuario_solicitante` INTEGER NOT NULL,
    `numero` VARCHAR(50) NOT NULL,
    `status` ENUM('RASCUNHO', 'ABERTA', 'APROVADA', 'ATENDIDA', 'CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
    `data_solicitacao` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `observacao` VARCHAR(255) NULL,

    INDEX `fk_req_compra_local`(`id_local_estoque`),
    INDEX `fk_req_compra_setor`(`id_setor_solicitante`),
    INDEX `fk_req_compra_usuario`(`id_usuario_solicitante`),
    UNIQUE INDEX `uk_req_compra_empresa_numero`(`id_empresa`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reserva_estoque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_local_estoque` INTEGER NULL,
    `id_setor` INTEGER NULL,
    `id_produto` INTEGER NOT NULL,
    `tipo_origem` ENUM('VENDA', 'ORDEM_PRODUCAO') NOT NULL,
    `id_venda` INTEGER NULL,
    `id_ordem_producao` INTEGER NULL,
    `id_necessidade_producao` INTEGER NULL,
    `quantidade` DECIMAL(15, 3) NOT NULL,
    `status` ENUM('ATIVA', 'ATENDIDA', 'CANCELADA') NOT NULL DEFAULT 'ATIVA',
    `id_usuario` INTEGER NOT NULL,
    `data_reserva` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_finalizacao` DATETIME(0) NULL,

    INDEX `fk_reserva_empresa`(`id_empresa`),
    INDEX `fk_reserva_estoque_local`(`id_local_estoque`),
    INDEX `fk_reserva_necessidade`(`id_necessidade_producao`),
    INDEX `fk_reserva_ordem`(`id_ordem_producao`),
    INDEX `fk_reserva_produto`(`id_produto`),
    INDEX `fk_reserva_setor`(`id_setor`),
    INDEX `fk_reserva_usuario`(`id_usuario`),
    INDEX `fk_reserva_venda`(`id_venda`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sequencias_automaticas` (
    `id_empresa` INTEGER NOT NULL,
    `entidade` VARCHAR(60) NOT NULL,
    `ultimo_numero` BIGINT UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`id_empresa`, `entidade`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `setores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `tipo` VARCHAR(80) NOT NULL DEFAULT 'Outro',
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    UNIQUE INDEX `uk_setor_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tamanhos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(50) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `ordem` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    UNIQUE INDEX `uk_tamanho_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_produto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,

    UNIQUE INDEX `uk_tipo_produto_nome`(`nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tipos_setor` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(80) NOT NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',

    UNIQUE INDEX `uk_tipo_setor_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuario_empresa` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_usuario` INTEGER NOT NULL,
    `id_empresa` INTEGER NOT NULL,
    `id_cargo` INTEGER NOT NULL,
    `id_setor` INTEGER NULL,
    `nivel_acesso` ENUM('EMPRESA', 'USUARIO') NOT NULL DEFAULT 'USUARIO',
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_vinculo` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `fk_usuario_empresa_cargo`(`id_cargo`),
    INDEX `fk_usuario_empresa_empresa`(`id_empresa`),
    INDEX `fk_usuario_empresa_setor`(`id_setor`),
    UNIQUE INDEX `uk_usuario_empresa`(`id_usuario`, `id_empresa`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nome` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `senha` VARCHAR(255) NOT NULL,
    `nivel_acesso` ENUM('ADMIN', 'USUARIO') NOT NULL DEFAULT 'USUARIO',
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_usuario_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venda` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `id_cliente` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `numero` VARCHAR(50) NOT NULL,
    `status` ENUM('RASCUNHO', 'CONFIRMADA', 'SEPARACAO', 'FATURADA', 'ENVIADA', 'ENTREGUE', 'CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
    `data_venda` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `data_entrega` DATETIME(0) NULL,
    `valor_total` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,

    INDEX `fk_venda_cliente`(`id_cliente`),
    INDEX `fk_venda_usuario`(`id_usuario`),
    UNIQUE INDEX `uk_venda_empresa_numero`(`id_empresa`, `numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `fk_auditoria_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditoria` ADD CONSTRAINT `fk_auditoria_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cargos` ADD CONSTRAINT `fk_cargos_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categorias` ADD CONSTRAINT `fk_categorias_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `fk_clientes_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compra_itens` ADD CONSTRAINT `fk_compra_item_compra` FOREIGN KEY (`id_compra`) REFERENCES `compras`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compra_itens` ADD CONSTRAINT `fk_compra_item_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compra_itens` ADD CONSTRAINT `fk_compra_item_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compra_itens` ADD CONSTRAINT `fk_compra_item_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_estoque` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_op` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_pedido_legado` FOREIGN KEY (`id_pedido_compra_legado`) REFERENCES `pedido_compra`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compras` ADD CONSTRAINT `fk_compra_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_necessidade` FOREIGN KEY (`id_necessidade_producao`) REFERENCES `necessidade_producao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_op` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_reserva` FOREIGN KEY (`id_reserva_estoque`) REFERENCES `reserva_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumo_producao` ADD CONSTRAINT `fk_consumo_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cores` ADD CONSTRAINT `fk_cores_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empresa_fornecedor` ADD CONSTRAINT `fk_empresa_fornecedor_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `empresa_fornecedor` ADD CONSTRAINT `fk_empresa_fornecedor_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estoque` ADD CONSTRAINT `fk_estoque_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estoque` ADD CONSTRAINT `fk_estoque_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estoque` ADD CONSTRAINT `fk_estoque_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `estoque` ADD CONSTRAINT `fk_estoque_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ficha_tecnica` ADD CONSTRAINT `fk_ficha_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ficha_tecnica` ADD CONSTRAINT `fk_ficha_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ficha_tecnica_item` ADD CONSTRAINT `fk_ficha_item_componente` FOREIGN KEY (`id_produto_componente`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ficha_tecnica_item` ADD CONSTRAINT `fk_ficha_item_ficha` FOREIGN KEY (`id_ficha_tecnica`) REFERENCES `ficha_tecnica`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fornecedores` ADD CONSTRAINT `fk_fornecedores_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_nota_fiscal` ADD CONSTRAINT `fk_item_nf_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_nota_fiscal` ADD CONSTRAINT `fk_item_nf_nota` FOREIGN KEY (`id_nota_fiscal`) REFERENCES `nota_fiscal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_nota_fiscal` ADD CONSTRAINT `fk_item_nf_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_nota_fiscal` ADD CONSTRAINT `fk_item_nf_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_pedido_compra` ADD CONSTRAINT `fk_item_pedido_compra_pedido` FOREIGN KEY (`id_pedido_compra`) REFERENCES `pedido_compra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_pedido_compra` ADD CONSTRAINT `fk_item_pedido_compra_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_requisicao_compra` ADD CONSTRAINT `fk_item_req_compra_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_requisicao_compra` ADD CONSTRAINT `fk_item_req_compra_requisicao` FOREIGN KEY (`id_requisicao_compra`) REFERENCES `requisicao_compra`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_venda` FOREIGN KEY (`id_venda`) REFERENCES `venda`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kardex` ADD CONSTRAINT `fk_kardex_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kardex` ADD CONSTRAINT `fk_kardex_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kardex` ADD CONSTRAINT `fk_kardex_movimentacao` FOREIGN KEY (`id_movimentacao`) REFERENCES `movimentacao_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kardex` ADD CONSTRAINT `fk_kardex_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kardex` ADD CONSTRAINT `fk_kardex_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locais_estoque` ADD CONSTRAINT `fk_locais_estoque_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimentacao_estoque` ADD CONSTRAINT `fk_mov_estoque_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimentacao_estoque` ADD CONSTRAINT `fk_mov_estoque_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimentacao_estoque` ADD CONSTRAINT `fk_mov_estoque_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimentacao_estoque` ADD CONSTRAINT `fk_mov_estoque_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimentacao_estoque` ADD CONSTRAINT `fk_mov_estoque_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `necessidade_producao` ADD CONSTRAINT `fk_necessidade_op` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `necessidade_producao` ADD CONSTRAINT `fk_necessidade_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nf_setor_destino` FOREIGN KEY (`id_setor_destino`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nota_fiscal_compra` FOREIGN KEY (`id_compra`) REFERENCES `compras`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nota_fiscal_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nota_fiscal_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nota_fiscal_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nota_fiscal` ADD CONSTRAINT `fk_nota_fiscal_pedido` FOREIGN KEY (`id_pedido_compra`) REFERENCES `pedido_compra`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao` ADD CONSTRAINT `fk_op_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao` ADD CONSTRAINT `fk_ordem_producao_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao` ADD CONSTRAINT `fk_ordem_producao_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao` ADD CONSTRAINT `fk_ordem_producao_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_consumo_planejado` ADD CONSTRAINT `fk_op_consumo_item` FOREIGN KEY (`id_ordem_producao_item`) REFERENCES `ordem_producao_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_consumo_planejado` ADD CONSTRAINT `fk_op_consumo_materia` FOREIGN KEY (`id_materia_prima`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_consumo_planejado` ADD CONSTRAINT `fk_op_consumo_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_fluxo_setor` ADD CONSTRAINT `fk_op_fluxo_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_fluxo_setor` ADD CONSTRAINT `fk_op_fluxo_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_item` ADD CONSTRAINT `fk_op_item_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_item` ADD CONSTRAINT `fk_op_item_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_item` ADD CONSTRAINT `fk_op_item_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_item` ADD CONSTRAINT `fk_op_item_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_item` ADD CONSTRAINT `fk_op_mov_item_item` FOREIGN KEY (`id_ordem_producao_item`) REFERENCES `ordem_producao_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_item` ADD CONSTRAINT `fk_op_mov_item_mov` FOREIGN KEY (`id_movimentacao`) REFERENCES `ordem_producao_movimentacao_setor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_setor` ADD CONSTRAINT `fk_op_movimentacao_destino` FOREIGN KEY (`id_setor_destino`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_setor` ADD CONSTRAINT `fk_op_movimentacao_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_setor` ADD CONSTRAINT `fk_op_movimentacao_origem` FOREIGN KEY (`id_setor_origem`) REFERENCES `setores`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_setor` ADD CONSTRAINT `fk_op_movimentacao_usuario_envio` FOREIGN KEY (`id_usuario_envio`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `ordem_producao_movimentacao_setor` ADD CONSTRAINT `fk_op_movimentacao_usuario_recebimento` FOREIGN KEY (`id_usuario_recebimento`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `pedido_compra` ADD CONSTRAINT `fk_pedido_compra_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_compra` ADD CONSTRAINT `fk_pedido_compra_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_compra` ADD CONSTRAINT `fk_pedido_compra_op` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_compra` ADD CONSTRAINT `fk_pedido_compra_requisicao` FOREIGN KEY (`id_requisicao_compra`) REFERENCES `requisicao_compra`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pedido_compra` ADD CONSTRAINT `fk_pedido_compra_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissoes_setor` ADD CONSTRAINT `fk_permissoes_setor_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissoes_usuario` ADD CONSTRAINT `fk_permissao_usuario_empresa` FOREIGN KEY (`id_usuario_empresa`) REFERENCES `usuario_empresa`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_empresa` ADD CONSTRAINT `fk_produto_empresa_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_empresa` ADD CONSTRAINT `fk_produto_empresa_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_empresa` ADD CONSTRAINT `fk_produto_empresa_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_empresa` ADD CONSTRAINT `fk_produto_empresa_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_fornecedor` ADD CONSTRAINT `fk_produto_fornecedor_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_fornecedor` ADD CONSTRAINT `fk_produto_fornecedor_fornecedor` FOREIGN KEY (`id_fornecedor`) REFERENCES `fornecedores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_fornecedor` ADD CONSTRAINT `fk_produto_fornecedor_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_variacoes` ADD CONSTRAINT `fk_produto_variacao_cor` FOREIGN KEY (`id_cor`) REFERENCES `cores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_variacoes` ADD CONSTRAINT `fk_produto_variacao_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_variacoes` ADD CONSTRAINT `fk_produto_variacao_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_variacoes` ADD CONSTRAINT `fk_produto_variacao_tamanho` FOREIGN KEY (`id_tamanho`) REFERENCES `tamanhos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `fk_produtos_categoria` FOREIGN KEY (`id_categoria`) REFERENCES `categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produtos` ADD CONSTRAINT `fk_produtos_tipo` FOREIGN KEY (`id_tipo_produto`) REFERENCES `tipos_produto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `fk_refresh_token_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requisicao_compra` ADD CONSTRAINT `fk_req_compra_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requisicao_compra` ADD CONSTRAINT `fk_req_compra_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requisicao_compra` ADD CONSTRAINT `fk_req_compra_setor` FOREIGN KEY (`id_setor_solicitante`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `requisicao_compra` ADD CONSTRAINT `fk_req_compra_usuario` FOREIGN KEY (`id_usuario_solicitante`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_estoque_local` FOREIGN KEY (`id_local_estoque`) REFERENCES `locais_estoque`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_necessidade` FOREIGN KEY (`id_necessidade_producao`) REFERENCES `necessidade_producao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_produto` FOREIGN KEY (`id_produto`) REFERENCES `produtos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reserva_estoque` ADD CONSTRAINT `fk_reserva_venda` FOREIGN KEY (`id_venda`) REFERENCES `venda`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sequencias_automaticas` ADD CONSTRAINT `fk_sequencia_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `setores` ADD CONSTRAINT `fk_setores_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tamanhos` ADD CONSTRAINT `fk_tamanhos_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tipos_setor` ADD CONSTRAINT `fk_tipo_setor_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario_empresa` ADD CONSTRAINT `fk_usuario_empresa_cargo` FOREIGN KEY (`id_cargo`) REFERENCES `cargos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario_empresa` ADD CONSTRAINT `fk_usuario_empresa_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario_empresa` ADD CONSTRAINT `fk_usuario_empresa_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `usuario_empresa` ADD CONSTRAINT `fk_usuario_empresa_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `fk_venda_cliente` FOREIGN KEY (`id_cliente`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `fk_venda_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `fk_venda_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
