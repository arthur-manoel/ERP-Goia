-- Migration de fechamento e contas a receber sobre o contrato DB-first existente.
-- Aplicar somente após aprovação da equipe e backup; não executa em deploy por si só.
-- Não editar após aplicada. Em caso de aplicação manual anterior, conferir toda a
-- estrutura antes de registrar esta migration como aplicada no histórico autorizado.
-- A validação desta entrega utiliza exclusivamente MySQL/MariaDB local isolado.
-- Base: develop 90b64eea48067c07da8c56387e82f67c8d3c7316, com a API de pedidos.
-- ALTER TABLE tem commit implícito: usar janela de manutenção e plano de backup.
-- Não há geração retroativa, concessão de permissões ou alteração de dados legados.
-- Pré-condições: confirmar o ENUM real, não remover valores extras, e verificar
-- que nenhuma venda possui o mesmo id_pedido_cliente_item não nulo em duas linhas.
-- Caso a pré-condição falhe, parar para regularização explícita; não apagar linhas.
ALTER TABLE clientes
  ADD UNIQUE INDEX uk_cliente_id_empresa (id, id_empresa);
ALTER TABLE pedido_cliente
  ADD UNIQUE INDEX uk_pedido_cliente_id_empresa_cliente (id, id_empresa, id_cliente);
ALTER TABLE venda
  ADD UNIQUE INDEX uk_venda_id_empresa_cliente_pedido (id, id_empresa, id_cliente, id_pedido_cliente);
ALTER TABLE categoria_financeira
  ADD UNIQUE INDEX uk_categoria_financeira_id_empresa (id, id_empresa);

CREATE TABLE pedido_cliente_fechamento (
  id INT NOT NULL AUTO_INCREMENT,
  id_empresa INT NOT NULL,
  id_pedido_cliente INT NOT NULL,
  id_cliente INT NOT NULL,
  id_venda INT NOT NULL,
  id_categoria INT NOT NULL,
  id_usuario INT NOT NULL,
  data_fechamento DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  valor_total DECIMAL(15,2) NOT NULL,
  total_parcelas INT NOT NULL,
  plano_pagamento JSON NOT NULL,
  hash_plano CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hash_pedido CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  snapshot_pedido JSON NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fechamento_empresa_pedido (id_empresa, id_pedido_cliente),
  UNIQUE KEY uk_fechamento_venda (id_venda),
  UNIQUE KEY uk_fechamento_id_empresa_venda_categoria (id, id_empresa, id_venda, id_categoria),
  KEY idx_fechamento_pedido (id_pedido_cliente, id_empresa, id_cliente),
  KEY idx_fechamento_cliente (id_cliente, id_empresa),
  KEY idx_fechamento_venda (id_venda, id_empresa, id_cliente, id_pedido_cliente),
  KEY idx_fechamento_categoria (id_categoria, id_empresa),
  KEY idx_fechamento_usuario (id_usuario),
  CONSTRAINT fk_fechamento_empresa FOREIGN KEY (id_empresa)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fechamento_pedido FOREIGN KEY (id_pedido_cliente, id_empresa, id_cliente)
    REFERENCES pedido_cliente(id, id_empresa, id_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fechamento_cliente FOREIGN KEY (id_cliente, id_empresa)
    REFERENCES clientes(id, id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fechamento_venda FOREIGN KEY (id_venda, id_empresa, id_cliente, id_pedido_cliente)
    REFERENCES venda(id, id_empresa, id_cliente, id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fechamento_categoria FOREIGN KEY (id_categoria, id_empresa)
    REFERENCES categoria_financeira(id, id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_fechamento_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE contas_receber
  ADD COLUMN id_fechamento INT NULL,
  ADD COLUMN saldo DECIMAL(15,2) NULL,
  ADD UNIQUE INDEX uk_conta_receber_fechamento_parcela (id_fechamento, numero_parcela),
  ADD INDEX idx_conta_receber_fechamento (id_fechamento, id_empresa, id_venda, id_categoria),
  ADD CONSTRAINT fk_conta_receber_fechamento
    FOREIGN KEY (id_fechamento, id_empresa, id_venda, id_categoria)
    REFERENCES pedido_cliente_fechamento(id, id_empresa, id_venda, id_categoria)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ck_conta_receber_fechamento_saldo CHECK
    (id_fechamento IS NULL OR (saldo IS NOT NULL AND saldo >= 0 AND saldo <= valor_final));
-- NULL nos registros antigos é preservado: não se presume saldo nem fechamento.

ALTER TABLE item_venda
  DROP FOREIGN KEY fk_item_venda_produto,
  DROP FOREIGN KEY fk_item_venda_pedido_item,
  ADD CONSTRAINT fk_item_venda_produto_restrict FOREIGN KEY (id_produto)
    REFERENCES produtos(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_item_venda_pedido_item_restrict FOREIGN KEY (id_pedido_cliente_item)
    REFERENCES pedido_cliente_item(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD COLUMN id_produto_sem_pedido INT GENERATED ALWAYS AS
    (CASE WHEN id_pedido_cliente_item IS NULL THEN id_produto ELSE NULL END) STORED,
  ADD UNIQUE INDEX uk_item_venda_produto_avulso (id_venda, id_produto_sem_pedido),
  ADD UNIQUE INDEX uk_item_venda_pedido_item (id_venda, id_pedido_cliente_item);
-- Vendas avulsas conservam uma linha por produto; vendas de pedido podem ter
-- duas variações do mesmo produto, identificadas por suas linhas reais do pedido.
-- As duas FKs das colunas-base usam ON UPDATE RESTRICT, pois MySQL não permite
-- ON UPDATE CASCADE em colunas usadas na expressão de coluna STORED gerada.

ALTER TABLE permissoes_usuario MODIFY recurso
  ENUM('PRODUTOS','ESTOQUE','NOTAS_FISCAIS','ORDENS_PRODUCAO','CORES','MODELOS','CATEGORIAS','CLIENTES','PEDIDOS','FINANCEIRO') NOT NULL;
-- Nenhuma permissão é concedida automaticamente.
