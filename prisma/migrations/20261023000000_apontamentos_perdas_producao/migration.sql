-- Issue #38. DB-first: aplicar no MySQL e introspectar o schema Prisma.
-- Alteração aditiva: não infere perdas nem altera quantidades históricas.
ALTER TABLE `ordem_producao_item`
    ADD UNIQUE INDEX `uk_op_item_ordem_id` (`id_ordem_producao`, `id`);

CREATE TABLE `ordem_producao_apontamento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_ordem_producao` INTEGER NOT NULL,
    `id_ordem_producao_item` INTEGER NOT NULL,
    `id_setor` INTEGER NOT NULL,
    `id_usuario` INTEGER NOT NULL,
    `data_apontamento` DATE NOT NULL,
    `quantidade_produzida` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `quantidade_perdida` DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    `motivo_perda` VARCHAR(255) NULL,
    `data_cadastro` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `idx_op_apontamento_etapa_data` (`id_ordem_producao`, `id_setor`, `data_apontamento`),
    INDEX `idx_op_apontamento_item` (`id_ordem_producao`, `id_ordem_producao_item`),
    INDEX `idx_op_apontamento_usuario` (`id_usuario`),
    CONSTRAINT `fk_op_apontamento_item` FOREIGN KEY (`id_ordem_producao`, `id_ordem_producao_item`)
        REFERENCES `ordem_producao_item` (`id_ordem_producao`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_op_apontamento_etapa` FOREIGN KEY (`id_ordem_producao`, `id_setor`)
        REFERENCES `ordem_producao_fluxo_setor` (`id_ordem_producao`, `id_setor`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `fk_op_apontamento_usuario` FOREIGN KEY (`id_usuario`)
        REFERENCES `usuarios` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT `chk_op_apontamento_quantidades` CHECK (
        `quantidade_produzida` >= 0 AND `quantidade_perdida` >= 0
        AND (`quantidade_produzida` > 0 OR `quantidade_perdida` > 0)
    ),
    CONSTRAINT `chk_op_apontamento_motivo` CHECK (
        (`quantidade_perdida` = 0 AND `motivo_perda` IS NULL)
        OR (`quantidade_perdida` > 0 AND `motivo_perda` IS NOT NULL
            AND CHAR_LENGTH(TRIM(`motivo_perda`)) > 0)
    )
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
