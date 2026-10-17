-- AlterTable
ALTER TABLE `ordem_producao_fluxo_setor` ADD COLUMN `data_conclusao` DATETIME(3) NULL,
    ADD COLUMN `data_inicio` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('PENDENTE', 'EM_PRODUCAO', 'CONCLUIDA') NOT NULL DEFAULT 'PENDENTE';

-- AlterTable
ALTER TABLE `setores` ADD COLUMN `data_atualizacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    ADD COLUMN `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable
CREATE TABLE `fluxos_producao` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_empresa` INTEGER NOT NULL,
    `nome` VARCHAR(100) NOT NULL,
    `descricao` VARCHAR(255) NULL,
    `status` ENUM('ATIVO', 'INATIVO') NOT NULL DEFAULT 'ATIVO',
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data_atualizacao` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `idx_fluxo_empresa_status`(`id_empresa`, `status`),
    UNIQUE INDEX `uk_fluxo_empresa_nome`(`id_empresa`, `nome`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `fluxo_producao_setor` (
    `id_fluxo` INTEGER NOT NULL,
    `id_setor` INTEGER NOT NULL,
    `ordem` INTEGER NOT NULL,

    INDEX `idx_fluxo_setor_setor`(`id_setor`),
    UNIQUE INDEX `uk_fluxo_setor_ordem`(`id_fluxo`, `ordem`),
    PRIMARY KEY (`id_fluxo`, `id_setor`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `produto_fluxo` (
    `id_empresa` INTEGER NOT NULL,
    `id_produto` INTEGER NOT NULL,
    `id_fluxo` INTEGER NOT NULL,

    INDEX `idx_produto_fluxo_fluxo`(`id_fluxo`),
    PRIMARY KEY (`id_empresa`, `id_produto`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ordem_producao_snapshot` (
    `id_ordem_producao` INTEGER NOT NULL,
    `id_fluxo` INTEGER NULL,
    `snapshot` JSON NOT NULL,

    INDEX `idx_snapshot_fluxo`(`id_fluxo`),
    PRIMARY KEY (`id_ordem_producao`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `fluxos_producao` ADD CONSTRAINT `fk_fluxo_empresa` FOREIGN KEY (`id_empresa`) REFERENCES `empresas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fluxo_producao_setor` ADD CONSTRAINT `fk_fluxo_setor_fluxo` FOREIGN KEY (`id_fluxo`) REFERENCES `fluxos_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `fluxo_producao_setor` ADD CONSTRAINT `fk_fluxo_setor_setor` FOREIGN KEY (`id_setor`) REFERENCES `setores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_fluxo` ADD CONSTRAINT `fk_produto_fluxo_produto_empresa` FOREIGN KEY (`id_empresa`, `id_produto`) REFERENCES `produto_empresa`(`id_empresa`, `id_produto`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `produto_fluxo` ADD CONSTRAINT `fk_produto_fluxo_fluxo` FOREIGN KEY (`id_fluxo`) REFERENCES `fluxos_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_snapshot` ADD CONSTRAINT `fk_snapshot_ordem` FOREIGN KEY (`id_ordem_producao`) REFERENCES `ordem_producao`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ordem_producao_snapshot` ADD CONSTRAINT `fk_snapshot_fluxo` FOREIGN KEY (`id_fluxo`) REFERENCES `fluxos_producao`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma não representa CHECK no schema; manter a restrição no banco.
ALTER TABLE `fluxo_producao_setor` ADD CONSTRAINT `chk_fluxo_setor_ordem` CHECK (`ordem` BETWEEN 1 AND 100);
