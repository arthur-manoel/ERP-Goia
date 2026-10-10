-- Proposta DB-first: aplicar SOMENTE após aprovação da equipe e backup.
-- Requer as tabelas de pedido/financeiro da PR #69 já presentes.
-- Não executar baseline, migrate deploy ou testes em banco remoto compartilhado.
-- ALTER TABLE no MySQL tem commit implícito: implantação em janela de manutenção.
-- Não altera status, saldos, valores ou vínculos dos registros legados.
ALTER TABLE pedido_cliente
  ADD COLUMN versao INT NOT NULL DEFAULT 1,
  ADD COLUMN chave_idempotencia VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN hash_requisicao CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE INDEX uk_pedido_empresa_idempotencia (id_empresa, chave_idempotencia);

ALTER TABLE pedido_cliente_item
  ADD COLUMN id_variacao INT NULL,
  ADD INDEX fk_pedido_item_variacao (id_variacao),
  ADD CONSTRAINT fk_pedido_item_variacao FOREIGN KEY (id_variacao)
    REFERENCES produto_variacoes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD UNIQUE INDEX uk_pedido_item_produto_variacao (id_pedido_cliente, id_produto, id_variacao);

-- NULL continua NULL: não se infere grade/cor/tamanho dos legados.
-- O índice NÃO basta para itens sem variação no MySQL. Todos os escritores devem
-- bloquear o cabeçalho FOR UPDATE e verificar duplicidade inclusive IS NULL.
-- A API também exige versão esperada para impedir perda silenciosa de edição.
ALTER TABLE permissoes_usuario MODIFY recurso
  ENUM('PRODUTOS','ESTOQUE','NOTAS_FISCAIS','ORDENS_PRODUCAO','CORES','MODELOS','CATEGORIAS','CLIENTES','PEDIDOS') NOT NULL;
-- Nenhuma permissão é concedida automaticamente.
