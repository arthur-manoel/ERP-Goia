-- DB-first. DECIMAL(16,3) preserva todos os inteiros do DECIMAL(15,2) legado.
ALTER TABLE ordem_producao_movimentacao_setor MODIFY quantidade DECIMAL(16,3) NULL,
 ADD UNIQUE KEY uk_lote_mov_ordem (id,id_ordem_producao);
ALTER TABLE ordem_producao_movimentacao_item MODIFY quantidade DECIMAL(16,3) NOT NULL,
 ADD COLUMN id_ordem_producao INT NULL,
 ADD UNIQUE KEY uk_lote_linha_ordem (id,id_movimentacao,id_ordem_producao),
 ADD CONSTRAINT fk_lote_linha_mov FOREIGN KEY (id_movimentacao,id_ordem_producao)
 REFERENCES ordem_producao_movimentacao_setor(id,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT fk_lote_linha_item FOREIGN KEY (id_ordem_producao,id_ordem_producao_item)
 REFERENCES ordem_producao_item(id_ordem_producao,id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT ck_lote_linha_positiva CHECK (id_ordem_producao IS NULL OR quantidade>0);
CREATE TABLE producao_lote_protocolo (
 id_empresa INT NOT NULL, id_ordem_producao INT NOT NULL,
 data_ativacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id_ordem_producao), UNIQUE KEY uk_lote_protocolo_empresa(id_empresa,id_ordem_producao),
 CONSTRAINT fk_lote_protocolo_op FOREIGN KEY(id_empresa,id_ordem_producao)
 REFERENCES ordem_producao(id_empresa,id) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE producao_remessa (
 id_movimentacao INT NOT NULL, id_empresa INT NOT NULL, id_ordem_producao INT NOT NULL,
 id_etapa_origem INT NOT NULL,id_setor_origem INT NOT NULL,
 id_etapa_destino INT NOT NULL,id_setor_destino INT NOT NULL,
 PRIMARY KEY(id_movimentacao), UNIQUE KEY uk_remessa_mov_ordem(id_movimentacao,id_ordem_producao),
 CONSTRAINT fk_remessa_protocolo FOREIGN KEY(id_empresa,id_ordem_producao)
 REFERENCES producao_lote_protocolo(id_empresa,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_remessa_mov FOREIGN KEY(id_movimentacao,id_ordem_producao)
 REFERENCES ordem_producao_movimentacao_setor(id,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_remessa_origem FOREIGN KEY(id_ordem_producao,id_etapa_origem,id_setor_origem)
 REFERENCES ordem_producao_fluxo_setor(id_ordem_producao,id,id_setor) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_remessa_destino FOREIGN KEY(id_ordem_producao,id_etapa_destino,id_setor_destino)
 REFERENCES ordem_producao_fluxo_setor(id_ordem_producao,id,id_setor) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT ck_remessa_etapas CHECK(id_etapa_origem<>id_etapa_destino)
) ENGINE=InnoDB;
CREATE TABLE producao_recebimento (
 id INT NOT NULL AUTO_INCREMENT, id_movimentacao INT NOT NULL,id_ordem_producao INT NOT NULL,
 id_empresa INT NOT NULL,id_usuario INT NOT NULL,
 data_recebimento DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id),UNIQUE KEY uk_lote_recebimento_mov(id,id_movimentacao,id_ordem_producao),
 CONSTRAINT fk_lote_recebimento_remessa FOREIGN KEY(id_movimentacao,id_ordem_producao)
 REFERENCES producao_remessa(id_movimentacao,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_lote_recebimento_op FOREIGN KEY(id_empresa,id_ordem_producao)
 REFERENCES producao_lote_protocolo(id_empresa,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_lote_recebimento_autor FOREIGN KEY(id_usuario,id_empresa)
 REFERENCES usuario_empresa(id_usuario,id_empresa) ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB;
CREATE TABLE producao_recebimento_item (
 id_recebimento INT NOT NULL,id_movimentacao INT NOT NULL,id_ordem_producao INT NOT NULL,
 id_linha INT NOT NULL,quantidade DECIMAL(16,3) NOT NULL,
 PRIMARY KEY(id_recebimento,id_linha),KEY idx_lote_recebimento_linha(id_linha),
 CONSTRAINT fk_lote_recebimento_cab FOREIGN KEY(id_recebimento,id_movimentacao,id_ordem_producao)
 REFERENCES producao_recebimento(id,id_movimentacao,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_lote_recebimento_linha FOREIGN KEY(id_linha,id_movimentacao,id_ordem_producao)
 REFERENCES ordem_producao_movimentacao_item(id,id_movimentacao,id_ordem_producao) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT ck_lote_recebimento_positivo CHECK(quantidade>0)
) ENGINE=InnoDB;
