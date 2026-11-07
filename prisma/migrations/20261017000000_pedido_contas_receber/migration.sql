-- Migration de fechamento e contas a receber sobre o contrato DB-first existente.
-- As tabelas pré-requisito são criadas por 20261016000000_pedido_contas_receber_prerequisites.
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

SET @ensure_uk_cliente_id_empresa_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'clientes' AND index_name = 'uk_cliente_id_empresa') = 0, 'ALTER TABLE clientes ADD UNIQUE INDEX uk_cliente_id_empresa (id, id_empresa)', 'SELECT 1');
PREPARE ensure_uk_cliente_id_empresa_stmt FROM @ensure_uk_cliente_id_empresa_sql;
EXECUTE ensure_uk_cliente_id_empresa_stmt;
DEALLOCATE PREPARE ensure_uk_cliente_id_empresa_stmt;

SET @ensure_uk_pedido_cliente_id_empresa_cliente_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'pedido_cliente' AND index_name = 'uk_pedido_cliente_id_empresa_cliente') = 0, 'ALTER TABLE pedido_cliente ADD UNIQUE INDEX uk_pedido_cliente_id_empresa_cliente (id, id_empresa, id_cliente)', 'SELECT 1');
PREPARE ensure_uk_pedido_cliente_id_empresa_cliente_stmt FROM @ensure_uk_pedido_cliente_id_empresa_cliente_sql;
EXECUTE ensure_uk_pedido_cliente_id_empresa_cliente_stmt;
DEALLOCATE PREPARE ensure_uk_pedido_cliente_id_empresa_cliente_stmt;

SET @ensure_uk_venda_id_empresa_cliente_pedido_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'venda' AND index_name = 'uk_venda_id_empresa_cliente_pedido') = 0, 'ALTER TABLE venda ADD UNIQUE INDEX uk_venda_id_empresa_cliente_pedido (id, id_empresa, id_cliente, id_pedido_cliente)', 'SELECT 1');
PREPARE ensure_uk_venda_id_empresa_cliente_pedido_stmt FROM @ensure_uk_venda_id_empresa_cliente_pedido_sql;
EXECUTE ensure_uk_venda_id_empresa_cliente_pedido_stmt;
DEALLOCATE PREPARE ensure_uk_venda_id_empresa_cliente_pedido_stmt;

SET @ensure_uk_categoria_financeira_id_empresa_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'categoria_financeira' AND index_name = 'uk_categoria_financeira_id_empresa') = 0, 'ALTER TABLE categoria_financeira ADD UNIQUE INDEX uk_categoria_financeira_id_empresa (id, id_empresa)', 'SELECT 1');
PREPARE ensure_uk_categoria_financeira_id_empresa_stmt FROM @ensure_uk_categoria_financeira_id_empresa_sql;
EXECUTE ensure_uk_categoria_financeira_id_empresa_stmt;
DEALLOCATE PREPARE ensure_uk_categoria_financeira_id_empresa_stmt;

CREATE TABLE IF NOT EXISTS pedido_cliente_fechamento (
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

-- Só adiciona campos, índices e restrições que ainda não existem.
SET @ensure_id_fechamento_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contas_receber' AND column_name = 'id_fechamento') = 0, 'ALTER TABLE contas_receber ADD COLUMN id_fechamento INT NULL', 'SELECT 1');
PREPARE ensure_id_fechamento_stmt FROM @ensure_id_fechamento_sql;
EXECUTE ensure_id_fechamento_stmt;
DEALLOCATE PREPARE ensure_id_fechamento_stmt;

SET @ensure_saldo_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contas_receber' AND column_name = 'saldo') = 0, 'ALTER TABLE contas_receber ADD COLUMN saldo DECIMAL(15,2) NULL', 'SELECT 1');
PREPARE ensure_saldo_stmt FROM @ensure_saldo_sql;
EXECUTE ensure_saldo_stmt;
DEALLOCATE PREPARE ensure_saldo_stmt;

SET @ensure_uk_conta_receber_fechamento_parcela_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contas_receber' AND index_name = 'uk_conta_receber_fechamento_parcela') = 0, 'ALTER TABLE contas_receber ADD UNIQUE INDEX uk_conta_receber_fechamento_parcela (id_fechamento, numero_parcela)', 'SELECT 1');
PREPARE ensure_uk_conta_receber_fechamento_parcela_stmt FROM @ensure_uk_conta_receber_fechamento_parcela_sql;
EXECUTE ensure_uk_conta_receber_fechamento_parcela_stmt;
DEALLOCATE PREPARE ensure_uk_conta_receber_fechamento_parcela_stmt;

SET @ensure_idx_conta_receber_fechamento_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'contas_receber' AND index_name = 'idx_conta_receber_fechamento') = 0, 'ALTER TABLE contas_receber ADD INDEX idx_conta_receber_fechamento (id_fechamento, id_empresa, id_venda, id_categoria)', 'SELECT 1');
PREPARE ensure_idx_conta_receber_fechamento_stmt FROM @ensure_idx_conta_receber_fechamento_sql;
EXECUTE ensure_idx_conta_receber_fechamento_stmt;
DEALLOCATE PREPARE ensure_idx_conta_receber_fechamento_stmt;

SET @ensure_fk_conta_receber_fechamento_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_receber' AND constraint_name = 'fk_conta_receber_fechamento' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE contas_receber ADD CONSTRAINT fk_conta_receber_fechamento FOREIGN KEY (id_fechamento, id_empresa, id_venda, id_categoria) REFERENCES pedido_cliente_fechamento(id, id_empresa, id_venda, id_categoria) ON DELETE RESTRICT ON UPDATE RESTRICT', 'SELECT 1');
PREPARE ensure_fk_conta_receber_fechamento_stmt FROM @ensure_fk_conta_receber_fechamento_sql;
EXECUTE ensure_fk_conta_receber_fechamento_stmt;
DEALLOCATE PREPARE ensure_fk_conta_receber_fechamento_stmt;

SET @ensure_ck_conta_receber_fechamento_saldo_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'contas_receber' AND constraint_name = 'ck_conta_receber_fechamento_saldo' AND constraint_type = 'CHECK') = 0, 'ALTER TABLE contas_receber ADD CONSTRAINT ck_conta_receber_fechamento_saldo CHECK (id_fechamento IS NULL OR (saldo IS NOT NULL AND saldo >= 0 AND saldo <= valor_final))', 'SELECT 1');
PREPARE ensure_ck_conta_receber_fechamento_saldo_stmt FROM @ensure_ck_conta_receber_fechamento_saldo_sql;
EXECUTE ensure_ck_conta_receber_fechamento_saldo_stmt;
DEALLOCATE PREPARE ensure_ck_conta_receber_fechamento_saldo_stmt;
-- NULL nos registros antigos é preservado: não se presume saldo nem fechamento.

-- Remove apenas as FKs legadas que ainda existirem, então adiciona as regras atuais.
SET @drop_fk_item_venda_produto_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_venda' AND constraint_name = 'fk_item_venda_produto' AND constraint_type = 'FOREIGN KEY') > 0, 'ALTER TABLE item_venda DROP FOREIGN KEY fk_item_venda_produto', 'SELECT 1');
PREPARE drop_fk_item_venda_produto_stmt FROM @drop_fk_item_venda_produto_sql;
EXECUTE drop_fk_item_venda_produto_stmt;
DEALLOCATE PREPARE drop_fk_item_venda_produto_stmt;

SET @drop_fk_item_venda_pedido_item_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_venda' AND constraint_name = 'fk_item_venda_pedido_item' AND constraint_type = 'FOREIGN KEY') > 0, 'ALTER TABLE item_venda DROP FOREIGN KEY fk_item_venda_pedido_item', 'SELECT 1');
PREPARE drop_fk_item_venda_pedido_item_stmt FROM @drop_fk_item_venda_pedido_item_sql;
EXECUTE drop_fk_item_venda_pedido_item_stmt;
DEALLOCATE PREPARE drop_fk_item_venda_pedido_item_stmt;

SET @ensure_fk_item_venda_produto_restrict_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_venda' AND constraint_name = 'fk_item_venda_produto_restrict' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE item_venda ADD CONSTRAINT fk_item_venda_produto_restrict FOREIGN KEY (id_produto) REFERENCES produtos(id) ON DELETE RESTRICT ON UPDATE RESTRICT', 'SELECT 1');
PREPARE ensure_fk_item_venda_produto_restrict_stmt FROM @ensure_fk_item_venda_produto_restrict_sql;
EXECUTE ensure_fk_item_venda_produto_restrict_stmt;
DEALLOCATE PREPARE ensure_fk_item_venda_produto_restrict_stmt;

SET @ensure_fk_item_venda_pedido_item_restrict_sql = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = 'item_venda' AND constraint_name = 'fk_item_venda_pedido_item_restrict' AND constraint_type = 'FOREIGN KEY') = 0, 'ALTER TABLE item_venda ADD CONSTRAINT fk_item_venda_pedido_item_restrict FOREIGN KEY (id_pedido_cliente_item) REFERENCES pedido_cliente_item(id) ON DELETE RESTRICT ON UPDATE RESTRICT', 'SELECT 1');
PREPARE ensure_fk_item_venda_pedido_item_restrict_stmt FROM @ensure_fk_item_venda_pedido_item_restrict_sql;
EXECUTE ensure_fk_item_venda_pedido_item_restrict_stmt;
DEALLOCATE PREPARE ensure_fk_item_venda_pedido_item_restrict_stmt;

SET @ensure_id_produto_sem_pedido_sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'item_venda' AND column_name = 'id_produto_sem_pedido') = 0, 'ALTER TABLE item_venda ADD COLUMN id_produto_sem_pedido INT GENERATED ALWAYS AS (CASE WHEN id_pedido_cliente_item IS NULL THEN id_produto ELSE NULL END) STORED', 'SELECT 1');
PREPARE ensure_id_produto_sem_pedido_stmt FROM @ensure_id_produto_sem_pedido_sql;
EXECUTE ensure_id_produto_sem_pedido_stmt;
DEALLOCATE PREPARE ensure_id_produto_sem_pedido_stmt;

SET @ensure_uk_item_venda_produto_avulso_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'item_venda' AND index_name = 'uk_item_venda_produto_avulso') = 0, 'ALTER TABLE item_venda ADD UNIQUE INDEX uk_item_venda_produto_avulso (id_venda, id_produto_sem_pedido)', 'SELECT 1');
PREPARE ensure_uk_item_venda_produto_avulso_stmt FROM @ensure_uk_item_venda_produto_avulso_sql;
EXECUTE ensure_uk_item_venda_produto_avulso_stmt;
DEALLOCATE PREPARE ensure_uk_item_venda_produto_avulso_stmt;

SET @ensure_uk_item_venda_pedido_item_sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'item_venda' AND index_name = 'uk_item_venda_pedido_item') = 0, 'ALTER TABLE item_venda ADD UNIQUE INDEX uk_item_venda_pedido_item (id_venda, id_pedido_cliente_item)', 'SELECT 1');
PREPARE ensure_uk_item_venda_pedido_item_stmt FROM @ensure_uk_item_venda_pedido_item_sql;
EXECUTE ensure_uk_item_venda_pedido_item_stmt;
DEALLOCATE PREPARE ensure_uk_item_venda_pedido_item_stmt;
-- Vendas avulsas conservam uma linha por produto; vendas de pedido podem ter
-- duas variações do mesmo produto, identificadas por suas linhas reais do pedido.
-- FKs sobre colunas usadas por expressões STORED precisam evitar ON UPDATE
-- CASCADE; cor e tamanho são alinhadas pela migration 20261012100000.

ALTER TABLE permissoes_usuario MODIFY recurso
  ENUM('PRODUTOS','ESTOQUE','NOTAS_FISCAIS','ORDENS_PRODUCAO','CORES','MODELOS','CATEGORIAS','CLIENTES','PEDIDOS','FINANCEIRO') NOT NULL;
-- Nenhuma permissão é concedida automaticamente.
