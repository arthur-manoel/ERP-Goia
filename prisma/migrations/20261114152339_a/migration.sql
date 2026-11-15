/*
  Warnings:

  - You are about to drop the column `id_cor_normalizado` on the `item_venda` table. All the data in the column will be lost.
  - You are about to drop the column `id_tamanho_normalizado` on the `item_venda` table. All the data in the column will be lost.
  - Added the required column `data_atualizacao` to the `clientes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `data_atualizacao` to the `venda` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `item_venda` DROP FOREIGN KEY `fk_item_venda_venda_empresa`;

-- DropForeignKey
ALTER TABLE `venda` DROP FOREIGN KEY `fk_venda_usuario`;

-- DropIndex
DROP INDEX `uk_item_venda_produto_variacao_nullsafe` ON `item_venda`;

-- AlterTable
ALTER TABLE `clientes` ADD COLUMN `data_atualizacao` DATETIME(3) NOT NULL,
    ADD COLUMN `id_condicao_pagamento` INTEGER NULL,
    ADD COLUMN `inscricao_estadual` VARCHAR(30) NULL,
    ADD COLUMN `limite_credito` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `nome_fantasia` VARCHAR(150) NULL,
    ADD COLUMN `observacao` TEXT NULL,
    ADD COLUMN `tipo_pessoa` ENUM('FISICA', 'JURIDICA') NOT NULL DEFAULT 'FISICA',
    MODIFY `status` ENUM('ATIVO', 'INATIVO', 'BLOQUEADO') NOT NULL DEFAULT 'ATIVO';

-- AlterTable
ALTER TABLE `item_venda` DROP COLUMN `id_cor_normalizado`,
    DROP COLUMN `id_tamanho_normalizado`;

-- AlterTable
ALTER TABLE `ordem_producao` ADD COLUMN `id_pedido_cliente` INTEGER NULL;

-- AlterTable
ALTER TABLE `ordem_producao_item` ADD COLUMN `id_pedido_cliente_item` INTEGER NULL;

-- AlterTable
ALTER TABLE `venda` ADD COLUMN `canal_venda` ENUM('BALCAO', 'LOJA', 'ONLINE', 'WHATSAPP', 'TELEFONE', 'OUTRO') NOT NULL DEFAULT 'BALCAO',
    ADD COLUMN `data_atualizacao` DATETIME(3) NOT NULL,
    ADD COLUMN `id_condicao_pagamento` INTEGER NULL,
    ADD COLUMN `id_endereco_entrega` INTEGER NULL,
    ADD COLUMN `observacao` TEXT NULL,
    ADD COLUMN `status_financeiro` ENUM('NAO_FATURADA', 'PARCIALMENTE_FATURADA', 'FATURADA', 'PAGA', 'PARCIALMENTE_PAGA', 'CANCELADA') NOT NULL DEFAULT 'NAO_FATURADA',
    ADD COLUMN `valor_acrescimo` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `valor_desconto` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `valor_frete` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `valor_subtotal` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `clientes_id_condicao_pagamento_idx` ON `clientes`(`id_condicao_pagamento`);

-- CreateIndex
CREATE INDEX `fk_ordem_producao_pedido_cliente` ON `ordem_producao`(`id_pedido_cliente`);

-- CreateIndex
CREATE INDEX `fk_ordem_producao_item_pedido_item` ON `ordem_producao_item`(`id_pedido_cliente_item`);

-- CreateIndex
CREATE INDEX `fk_venda_cliente` ON `venda`(`id_cliente`);

-- CreateIndex
CREATE INDEX `venda_id_condicao_pagamento_idx` ON `venda`(`id_condicao_pagamento`);

-- CreateIndex
CREATE INDEX `venda_id_endereco_entrega_idx` ON `venda`(`id_endereco_entrega`);

-- CreateIndex
CREATE INDEX `venda_status_financeiro_idx` ON `venda`(`status_financeiro`);

-- CreateIndex
CREATE INDEX `fk_venda_pedido_cliente` ON `venda`(`id_pedido_cliente`);

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_id_condicao_pagamento_fkey` FOREIGN KEY (`id_condicao_pagamento`) REFERENCES `condicoes_pagamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locais_estoque` ADD CONSTRAINT `fk_locais_estoque_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao` ADD CONSTRAINT `fk_ordem_producao_pedido_cliente` FOREIGN KEY (`id_pedido_cliente`) REFERENCES `pedido_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_item` ADD CONSTRAINT `fk_ordem_producao_item_pedido_item` FOREIGN KEY (`id_pedido_cliente_item`) REFERENCES `pedido_cliente_item`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `venda_id_condicao_pagamento_fkey` FOREIGN KEY (`id_condicao_pagamento`) REFERENCES `condicoes_pagamento`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `venda_id_endereco_entrega_fkey` FOREIGN KEY (`id_endereco_entrega`) REFERENCES `cliente_endereco`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venda` ADD CONSTRAINT `fk_venda_pedido_cliente` FOREIGN KEY (`id_pedido_cliente`) REFERENCES `pedido_cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
