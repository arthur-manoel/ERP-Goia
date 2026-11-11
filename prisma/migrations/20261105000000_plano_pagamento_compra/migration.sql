-- Apply in a maintenance window after validating a backup. Existing titles keep a NULL plan.
ALTER TABLE compras
  ADD COLUMN chave_criacao VARCHAR(64) NULL,
  ADD COLUMN hash_criacao CHAR(64) NULL,
  ADD UNIQUE KEY uk_compra_empresa_chave_criacao (id_empresa, chave_criacao),
  ADD UNIQUE KEY uk_compra_id_empresa (id, id_empresa);

CREATE TABLE planos_pagamento_compra (
  id INT NOT NULL AUTO_INCREMENT,
  id_empresa INT NOT NULL,
  id_compra INT NOT NULL,
  id_categoria INT NOT NULL,
  id_usuario INT NOT NULL,
  valor_total DECIMAL(15,2) NOT NULL,
  vencimentos JSON NOT NULL,
  data_confirmacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  data_cancelamento DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plano_pagamento_empresa_compra (id_empresa, id_compra),
  UNIQUE KEY uk_plano_pagamento_parcela_fk (id, id_empresa, id_compra, id_categoria),
  KEY idx_plano_pagamento_compra (id_compra, id_empresa),
  CONSTRAINT fk_plano_pagamento_compra FOREIGN KEY (id_compra, id_empresa)
    REFERENCES compras (id, id_empresa) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

ALTER TABLE contas_pagar
  ADD COLUMN id_plano_pagamento INT NULL,
  ADD UNIQUE KEY uk_contas_pagar_plano_parcela (id_plano_pagamento, numero_parcela),
  ADD KEY idx_contas_pagar_plano_fk (id_plano_pagamento, id_empresa, id_compra, id_categoria),
  ADD CONSTRAINT fk_contas_pagar_plano_pagamento
    FOREIGN KEY (id_plano_pagamento, id_empresa, id_compra, id_categoria)
    REFERENCES planos_pagamento_compra (id, id_empresa, id_compra, id_categoria)
    ON DELETE RESTRICT ON UPDATE CASCADE;
