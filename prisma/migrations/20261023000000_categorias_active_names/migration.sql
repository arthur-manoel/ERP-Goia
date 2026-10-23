-- A unicidade entre categorias ATIVAS é verificada na transação do módulo,
-- serializada pelo bloqueio da empresa. Categorias INATIVAS podem repetir nomes.
-- Cria primeiro o índice substituto para preservar o suporte à chave estrangeira.
ALTER TABLE `categorias`
  ADD INDEX `idx_categoria_empresa_nome` (`id_empresa`, `nome`),
  DROP INDEX `uk_categoria_empresa_nome`;
