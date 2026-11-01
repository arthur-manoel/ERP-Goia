-- Extensão do mecanismo oficial; estoque continua sendo a projeção agregada.
-- A grade detalha a posição: nunca atribui o saldo legado a uma cor/tamanho.
ALTER TABLE estoque ADD UNIQUE KEY uk_estoque_identidade_empresa_produto (id, id_empresa, id_produto);
ALTER TABLE produto_variacoes ADD UNIQUE KEY uk_variacao_identidade_empresa_produto (id, id_empresa, id_produto);
CREATE TABLE estoque_variacao (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_estoque INT NOT NULL,
  id_empresa INT NOT NULL,
  id_produto INT NOT NULL,
  id_variacao INT NOT NULL,
  quantidade DECIMAL(15,3) NOT NULL DEFAULT 0,
  quantidade_reservada DECIMAL(15,3) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_estoque_variacao (id_estoque, id_variacao),
  CONSTRAINT fk_ev_posicao FOREIGN KEY (id_estoque,id_empresa,id_produto) REFERENCES estoque (id,id_empresa,id_produto) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ev_variacao FOREIGN KEY (id_variacao,id_empresa,id_produto) REFERENCES produto_variacoes (id,id_empresa,id_produto) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_ev_saldos CHECK (quantidade >= 0 AND quantidade_reservada >= 0 AND quantidade_reservada <= quantidade)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE movimentacao_estoque
  ADD COLUMN id_variacao INT NULL,
  ADD COLUMN chave_operacao VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uk_movimento_empresa_operacao (id_empresa,chave_operacao),
  ADD CONSTRAINT fk_movimento_variacao FOREIGN KEY (id_variacao,id_empresa,id_produto) REFERENCES produto_variacoes (id,id_empresa,id_produto) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE reserva_estoque
  ADD COLUMN id_pedido_cliente_item INT NULL,
  ADD COLUMN id_variacao INT NULL,
  ADD COLUMN quantidade_consumida DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN quantidade_liberada DECIMAL(15,3) NOT NULL DEFAULT 0,
  ADD COLUMN protocolo_integrado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT fk_reserva_pedido_item FOREIGN KEY (id_pedido_cliente_item) REFERENCES pedido_cliente_item(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_reserva_variacao FOREIGN KEY (id_variacao,id_empresa,id_produto) REFERENCES produto_variacoes (id,id_empresa,id_produto) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ck_reserva_integrada CHECK (protocolo_integrado = FALSE OR
    (quantidade > 0 AND quantidade_consumida >= 0 AND quantidade_liberada >= 0
     AND quantidade_consumida + quantidade_liberada <= quantidade));
ALTER TABLE consumo_producao
  ADD COLUMN id_movimentacao_estoque INT NULL,
  ADD UNIQUE KEY uk_consumo_movimento (id_movimentacao_estoque),
  ADD CONSTRAINT fk_consumo_movimento FOREIGN KEY (id_movimentacao_estoque) REFERENCES movimentacao_estoque(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE necessidade_producao ADD COLUMN consumo_confirmado_em DATETIME(3) NULL;
CREATE TABLE operacao_erp (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa INT NOT NULL,
  id_usuario INT NOT NULL,
  chave VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  resultado JSON NOT NULL,
  data_cadastro DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_operacao_empresa_chave (id_empresa,chave),
  CONSTRAINT fk_operacao_usuario_empresa FOREIGN KEY (id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE transferencia_estoque (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_empresa INT NOT NULL,
  id_usuario INT NOT NULL,
  id_produto INT NOT NULL,
  id_variacao INT NULL,
  id_local_origem INT NOT NULL,
  id_setor_origem INT NOT NULL,
  id_local_destino INT NOT NULL,
  id_setor_destino INT NOT NULL,
  quantidade DECIMAL(15,3) NOT NULL,
  status ENUM('ENVIADA','RECEBIDA') NOT NULL DEFAULT 'ENVIADA',
  id_movimento_saida INT NOT NULL UNIQUE,
  id_movimento_entrada INT NULL UNIQUE,
  data_envio DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  data_recebimento DATETIME(3) NULL,
  CONSTRAINT ck_transferencia CHECK (quantidade > 0 AND id_local_origem <> id_local_destino AND
    ((status='ENVIADA' AND id_movimento_entrada IS NULL AND data_recebimento IS NULL) OR (status='RECEBIDA' AND id_movimento_entrada IS NOT NULL AND data_recebimento IS NOT NULL))),
  CONSTRAINT fk_transferencia_origem FOREIGN KEY (id_empresa,id_local_origem) REFERENCES locais_estoque(id_empresa,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_transferencia_destino FOREIGN KEY (id_empresa,id_local_destino) REFERENCES locais_estoque(id_empresa,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_transferencia_usuario FOREIGN KEY (id_usuario,id_empresa) REFERENCES usuario_empresa(id_usuario,id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_transferencia_saida FOREIGN KEY (id_movimento_saida) REFERENCES movimentacao_estoque(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_transferencia_entrada FOREIGN KEY (id_movimento_entrada) REFERENCES movimentacao_estoque(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_transferencia_variacao FOREIGN KEY (id_variacao,id_empresa,id_produto) REFERENCES produto_variacoes(id,id_empresa,id_produto) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
