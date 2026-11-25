-- DB-first: vínculos novos são nulos no histórico; nenhum recebimento é presumido.
ALTER TABLE nota_fiscal ADD COLUMN versao INT NOT NULL DEFAULT 1,
 ADD COLUMN justificativa_valores VARCHAR(255) NULL,
 ADD UNIQUE KEY uk_nf_identidade_compra(id,id_empresa,id_compra);
ALTER TABLE compra_itens ADD UNIQUE KEY uk_compra_linha_produto(id_compra,id,id_produto);
ALTER TABLE movimentacao_estoque ADD UNIQUE KEY uk_mov_compra_produto(id,id_empresa,id_produto);
ALTER TABLE item_nota_fiscal
 ADD COLUMN id_empresa INT NULL, ADD COLUMN id_compra INT NULL, ADD COLUMN id_compra_item INT NULL,
 ADD COLUMN id_variacao INT NULL, ADD COLUMN id_local_estoque INT NULL, ADD COLUMN id_setor INT NULL,
 ADD UNIQUE KEY uk_nf_linha_identidade(id,id_nota_fiscal,id_empresa,id_compra,id_compra_item,id_produto),
 ADD CONSTRAINT fk_nf_linha_cab FOREIGN KEY(id_nota_fiscal,id_empresa,id_compra) REFERENCES nota_fiscal(id,id_empresa,id_compra) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT fk_nf_linha_compra FOREIGN KEY(id_compra,id_compra_item,id_produto) REFERENCES compra_itens(id_compra,id,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT fk_nf_linha_variacao FOREIGN KEY(id_variacao,id_empresa,id_produto) REFERENCES produto_variacoes(id,id_empresa,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT fk_nf_linha_local FOREIGN KEY(id_local_estoque) REFERENCES locais_estoque(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
 ADD CONSTRAINT fk_nf_linha_setor FOREIGN KEY(id_setor) REFERENCES setores(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
CREATE TABLE compra_recebimento_linha (
 id_movimentacao INT NOT NULL,id_empresa INT NOT NULL,id_compra INT NOT NULL,id_compra_item INT NOT NULL,id_produto INT NOT NULL,
 quantidade DECIMAL(15,3) NOT NULL,
 PRIMARY KEY(id_movimentacao),
 UNIQUE KEY uk_recebimento_linha_mov(id_movimentacao,id_empresa,id_produto),
 UNIQUE KEY uk_recebimento_linha_identidade(id_movimentacao,id_empresa,id_compra,id_compra_item,id_produto),
 CONSTRAINT fk_recebimento_linha_compra FOREIGN KEY(id_compra,id_empresa) REFERENCES compras(id,id_empresa) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_recebimento_linha_item FOREIGN KEY(id_compra,id_compra_item,id_produto) REFERENCES compra_itens(id_compra,id,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_recebimento_linha_mov FOREIGN KEY(id_movimentacao,id_empresa,id_produto) REFERENCES movimentacao_estoque(id,id_empresa,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT ck_recebimento_linha_positivo CHECK(quantidade>0)
) ENGINE=InnoDB;
CREATE TABLE nota_item_entrada (
 id_item_nota INT NOT NULL,id_nota INT NOT NULL,id_empresa INT NOT NULL,id_compra INT NOT NULL,id_compra_item INT NOT NULL,id_produto INT NOT NULL,id_movimentacao INT NOT NULL,
 quantidade DECIMAL(15,3) NOT NULL,
 PRIMARY KEY(id_item_nota,id_movimentacao),
 CONSTRAINT fk_nf_entrada_linha FOREIGN KEY(id_item_nota,id_nota,id_empresa,id_compra,id_compra_item,id_produto) REFERENCES item_nota_fiscal(id,id_nota_fiscal,id_empresa,id_compra,id_compra_item,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT fk_nf_entrada_recebimento FOREIGN KEY(id_movimentacao,id_empresa,id_compra,id_compra_item,id_produto) REFERENCES compra_recebimento_linha(id_movimentacao,id_empresa,id_compra,id_compra_item,id_produto) ON UPDATE RESTRICT ON DELETE RESTRICT,
 CONSTRAINT ck_nf_entrada_positivo CHECK(quantidade>0)
) ENGINE=InnoDB;
