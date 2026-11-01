-- Incremento DB-first da PR #121; aplicar primeiro somente em base local isolada.
-- A implantação compartilhada depende da revisão e aplicação pelo responsável.
-- Não altera histórico de pagamentos, movimentos ou fechamentos existentes.
ALTER TABLE cargos ADD COLUMN aprova_cancelamento BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pedido_cliente ADD UNIQUE KEY uk_pedido_id_empresa (id,id_empresa);
ALTER TABLE pedido_cliente_fechamento ADD UNIQUE KEY uk_fechamento_id_empresa_pedido (id,id_empresa,id_pedido_cliente);
ALTER TABLE movimentacao_estoque ADD UNIQUE KEY uk_movimento_id_empresa (id,id_empresa);
CREATE TABLE pedido_cancelamento (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_pedido_cliente INT NOT NULL,
 id_solicitante INT NOT NULL,
 tipo VARCHAR(20) NOT NULL,
 id_entrega INT NULL,
 id_fechamento_referencia INT NULL,
 motivo VARCHAR(255) NOT NULL,
 status VARCHAR(30) NOT NULL,
 exige_aprovacao BOOLEAN NOT NULL,
 referencia_inconsistente BOOLEAN NOT NULL DEFAULT FALSE,
 fechado_em_referencia DATETIME(3) NULL,
 limite_sem_aprovacao DATETIME(3) NULL,
 solicitado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 id_decisor INT NULL,
 decisao VARCHAR(10) NULL,
 motivo_decisao VARCHAR(255) NULL,
 decidido_em DATETIME(3) NULL,
 executado_em DATETIME(3) NULL,
 concluido_em DATETIME(3) NULL,
 hash_estado CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 plano_efeitos JSON NOT NULL,
 ultima_falha VARCHAR(255) NULL,
 pedido_ativo INT GENERATED ALWAYS AS (CASE WHEN status IN ('AGUARDANDO_APROVACAO','AGUARDANDO_EXECUCAO','EXECUTADA_PENDENCIAS','INTERVENCAO') THEN id_pedido_cliente ELSE NULL END) STORED,
 UNIQUE KEY uk_cancelamento_id_empresa (id,id_empresa),
 UNIQUE KEY uk_cancelamento_id_empresa_pedido (id,id_empresa,id_pedido_cliente),
 UNIQUE KEY uk_cancelamento_pedido_ativo (id_empresa,pedido_ativo),
 KEY idx_cancelamento_empresa_status (id_empresa,status,id),
 CONSTRAINT fk_cancelamento_pedido FOREIGN KEY(id_pedido_cliente,id_empresa) REFERENCES pedido_cliente(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_cancelamento_solicitante FOREIGN KEY(id_solicitante,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_cancelamento_decisor FOREIGN KEY(id_decisor,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_cancelamento_entrega FOREIGN KEY(id_entrega,id_pedido_cliente) REFERENCES pedido_cliente_entrega(id,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_cancelamento_fechamento FOREIGN KEY(id_fechamento_referencia,id_empresa,id_pedido_cliente) REFERENCES pedido_cliente_fechamento(id,id_empresa,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_cancelamento_tipo CHECK(tipo IN ('PEDIDO','ENTREGA','FECHAMENTO') AND ((tipo='ENTREGA' AND id_entrega IS NOT NULL) OR (tipo<>'ENTREGA' AND id_entrega IS NULL))),
 CONSTRAINT ck_cancelamento_status CHECK(status IN ('AGUARDANDO_APROVACAO','AGUARDANDO_EXECUCAO','REJEITADA','EXECUTADA_PENDENCIAS','CONCLUIDA','INTERVENCAO')),
 CONSTRAINT ck_cancelamento_decisao CHECK((decisao IS NULL AND id_decisor IS NULL AND decidido_em IS NULL) OR (decisao IN ('APROVADA','REJEITADA') AND id_decisor IS NOT NULL AND decidido_em IS NOT NULL AND motivo_decisao IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_entrega_estorno (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_pedido_cliente INT NOT NULL,
 id_cancelamento INT NOT NULL,
 id_entrega INT NOT NULL,
 id_usuario INT NOT NULL,
 status_anterior VARCHAR(30) NOT NULL,
 valor_creditado DECIMAL(15,2) NOT NULL DEFAULT 0,
 rateio_itens JSON NOT NULL,
 data_estorno DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_entrega_estorno_origem(id_entrega),
 UNIQUE KEY uk_entrega_estorno_id_empresa(id,id_empresa),
 CONSTRAINT fk_entrega_estorno_cancelamento FOREIGN KEY(id_cancelamento,id_empresa,id_pedido_cliente) REFERENCES pedido_cancelamento(id,id_empresa,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_entrega_estorno_origem FOREIGN KEY(id_entrega,id_pedido_cliente) REFERENCES pedido_cliente_entrega(id,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_entrega_estorno_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_entrega_estorno_valor CHECK(valor_creditado>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_devolucao_linha (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_entrega_estorno INT NOT NULL,
 id_movimento_saida INT NOT NULL,
 quantidade_prevista DECIMAL(15,3) NOT NULL,
 UNIQUE KEY uk_devolucao_movimento_saida(id_movimento_saida),
 UNIQUE KEY uk_devolucao_linha_id_empresa(id,id_empresa),
 CONSTRAINT fk_devolucao_estorno FOREIGN KEY(id_entrega_estorno,id_empresa) REFERENCES pedido_entrega_estorno(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_devolucao_movimento FOREIGN KEY(id_movimento_saida,id_empresa) REFERENCES movimentacao_estoque(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_devolucao_prevista CHECK(quantidade_prevista>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_devolucao_recebimento (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_linha INT NOT NULL,
 id_usuario INT NOT NULL,
 quantidade DECIMAL(15,3) NOT NULL,
 condicao VARCHAR(20) NOT NULL,
 recebido_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 observacao VARCHAR(255) NOT NULL,
 UNIQUE KEY uk_devolucao_recebimento_id_empresa(id,id_empresa),
 CONSTRAINT fk_devolucao_recebimento_linha FOREIGN KEY(id_linha,id_empresa) REFERENCES pedido_devolucao_linha(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_devolucao_recebimento_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_devolucao_recebimento CHECK(quantidade>0 AND condicao IN ('APROVEITAVEL','AVARIADA'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_devolucao_destinacao (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_recebimento INT NOT NULL,
 id_usuario INT NOT NULL,
 quantidade DECIMAL(15,3) NOT NULL,
 tratamento VARCHAR(10) NOT NULL,
 motivo VARCHAR(255) NOT NULL,
 id_movimento_entrada INT NOT NULL,
 id_movimento_saida INT NULL,
 data_destinacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_devolucao_destino_entrada(id_movimento_entrada),
 UNIQUE KEY uk_devolucao_destino_saida(id_movimento_saida),
 CONSTRAINT fk_devolucao_destino_recebimento FOREIGN KEY(id_recebimento,id_empresa) REFERENCES pedido_devolucao_recebimento(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_devolucao_destino_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_devolucao_destino_entrada FOREIGN KEY(id_movimento_entrada,id_empresa) REFERENCES movimentacao_estoque(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_devolucao_destino_saida FOREIGN KEY(id_movimento_saida,id_empresa) REFERENCES movimentacao_estoque(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_devolucao_destinacao CHECK(quantidade>0 AND ((tratamento='ESTOQUE' AND id_movimento_saida IS NULL) OR (tratamento='DESCARTE' AND id_movimento_saida IS NOT NULL)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_credito_receber (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_cancelamento INT NOT NULL,
 id_conta_receber INT NOT NULL,
 id_usuario INT NOT NULL,
 valor DECIMAL(15,2) NOT NULL,
 saldo_anulado DECIMAL(15,2) NOT NULL,
 valor_restituir DECIMAL(15,2) NOT NULL,
 saldo_anterior DECIMAL(15,2) NOT NULL,
 situacao_anterior VARCHAR(15) NOT NULL,
 data_credito DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_credito_cancelamento_titulo(id_cancelamento,id_conta_receber),
 UNIQUE KEY uk_credito_id_empresa(id,id_empresa),
 CONSTRAINT fk_credito_cancelamento FOREIGN KEY(id_cancelamento,id_empresa) REFERENCES pedido_cancelamento(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_credito_titulo FOREIGN KEY(id_conta_receber,id_empresa) REFERENCES contas_receber(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_credito_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_credito_valores CHECK(valor>0 AND saldo_anulado>=0 AND valor_restituir>=0 AND saldo_anulado+valor_restituir=valor AND saldo_anterior>=saldo_anulado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE pedido_reembolso (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_credito INT NOT NULL,
 id_conta_bancaria INT NOT NULL,
 id_usuario INT NOT NULL,
 valor DECIMAL(15,2) NOT NULL,
 data_pagamento DATETIME(3) NOT NULL,
 referencia VARCHAR(100) NULL,
 observacao VARCHAR(255) NULL,
 data_cadastro DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_reembolso_id_empresa(id,id_empresa),
 CONSTRAINT fk_reembolso_credito FOREIGN KEY(id_credito,id_empresa) REFERENCES pedido_credito_receber(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_reembolso_banco FOREIGN KEY(id_conta_bancaria,id_empresa) REFERENCES contas_bancarias(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_reembolso_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_reembolso_valor CHECK(valor>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE movimentacoes_financeiras
 ADD COLUMN id_pedido_reembolso INT NULL,
 ADD UNIQUE KEY uk_movimento_financeiro_reembolso(id_pedido_reembolso),
 ADD CONSTRAINT fk_movimento_financeiro_reembolso FOREIGN KEY(id_pedido_reembolso,id_empresa) REFERENCES pedido_reembolso(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE TABLE pedido_fechamento_estorno (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_pedido_cliente INT NOT NULL,
 id_cancelamento INT NOT NULL,
 id_fechamento INT NOT NULL,
 id_usuario INT NOT NULL,
 data_estorno DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_fechamento_estorno_origem(id_fechamento),
 CONSTRAINT fk_fechamento_estorno_cancelamento FOREIGN KEY(id_cancelamento,id_empresa,id_pedido_cliente) REFERENCES pedido_cancelamento(id,id_empresa,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_fechamento_estorno_origem FOREIGN KEY(id_fechamento,id_empresa,id_pedido_cliente) REFERENCES pedido_cliente_fechamento(id,id_empresa,id_pedido_cliente) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_fechamento_estorno_usuario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE notificacao_evento (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_cancelamento INT NOT NULL,
 tipo VARCHAR(40) NOT NULL,
 chave VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 destino VARCHAR(15) NOT NULL,
 titulo VARCHAR(120) NOT NULL,
 mensagem VARCHAR(255) NOT NULL,
 criado_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 processado_em DATETIME(3) NULL,
 tentativas INT NOT NULL DEFAULT 0,
 ultimo_erro VARCHAR(255) NULL,
 UNIQUE KEY uk_notificacao_evento_chave(id_empresa,chave),
 UNIQUE KEY uk_notificacao_evento_id_empresa(id,id_empresa),
 CONSTRAINT fk_notificacao_evento_cancelamento FOREIGN KEY(id_cancelamento,id_empresa) REFERENCES pedido_cancelamento(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT ck_notificacao_evento CHECK(tentativas>=0 AND destino IN ('GERENCIA','SOLICITANTE','ESTOQUE','FINANCEIRO','TODOS'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE notificacao_interna (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 id_empresa INT NOT NULL,
 id_usuario INT NOT NULL,
 id_evento INT NOT NULL,
 lida_em DATETIME(3) NULL,
 criada_em DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_notificacao_destinatario(id_evento,id_usuario),
 KEY idx_notificacao_usuario_lida(id_empresa,id_usuario,lida_em,id),
 CONSTRAINT fk_notificacao_destinatario FOREIGN KEY(id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
 CONSTRAINT fk_notificacao_evento FOREIGN KEY(id_evento,id_empresa) REFERENCES notificacao_evento(id,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;