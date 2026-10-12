-- A limpeza de declarações repetidas e relações inversas no schema Prisma não
-- exige DROP TABLE/COLUMN: o banco inicial já continha cada objeto físico uma vez.
-- Esta migration registra os ajustes físicos de índices e chaves feitos no schema.
-- Alinha os índices e relacionamentos de venda com o schema Prisma.
-- A unicidade normalizada trata NULL como ausência de variação.

-- A migration 20261007000000 adicionou uma segunda chave única equivalente.
-- Mantém a chave com nome alinhado ao schema e remove o índice legado redundante.
ALTER TABLE `usuario_empresa`
  DROP INDEX `uk_usuario_empresa`,
  ADD UNIQUE INDEX `uk_usuario_empresa_id_empresa` (`id`, `id_empresa`);

-- Históricos antigos cujo usuário não pertence à empresa da venda ficam sem
-- atribuição de usuário, preservando o evento sem manter uma associação inválida.
UPDATE `venda_status_historico` h
LEFT JOIN `usuario_empresa` ue
  ON ue.`id` = h.`id_usuario_empresa`
  AND ue.`id_empresa` = h.`id_empresa`
SET h.`id_usuario_empresa` = NULL
WHERE h.`id_usuario_empresa` IS NOT NULL
  AND ue.`id` IS NULL;

-- A FK composta impede associação de histórico com usuário de outra empresa.
ALTER TABLE `venda_status_historico`
  DROP FOREIGN KEY `fk_venda_historico_usuario`,
  DROP INDEX `fk_venda_historico_usuario`,
  ADD INDEX `idx_venda_historico_usuario_empresa` (`id_usuario_empresa`, `id_empresa`),
  ADD CONSTRAINT `fk_venda_historico_usuario_empresa`
    FOREIGN KEY (`id_usuario_empresa`, `id_empresa`)
    REFERENCES `usuario_empresa` (`id`, `id_empresa`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- MySQL/MariaDB permitem chaves UNIQUE repetidas quando um componente é NULL.
-- As colunas geradas normalizam NULL para zero (IDs válidos começam em 1),
-- fechando essa lacuna sem alterar a semântica opcional de cor e tamanho no app.
ALTER TABLE `item_venda`
  ADD COLUMN `id_cor_normalizado` INTEGER
    GENERATED ALWAYS AS (COALESCE(`id_cor`, 0)) STORED,
  ADD COLUMN `id_tamanho_normalizado` INTEGER
    GENERATED ALWAYS AS (COALESCE(`id_tamanho`, 0)) STORED,
  ADD UNIQUE INDEX `uk_item_venda_produto_variacao_nullsafe`
    (`id_empresa`, `id_venda`, `id_produto`, `id_cor_normalizado`, `id_tamanho_normalizado`);
