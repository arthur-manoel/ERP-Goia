-- Incremental DB-first. Revisar/aplicar somente pelo responsável nos demais
-- ambientes. Desenvolvimento e testes: banco local isolado.
-- Campos opcionais preservam os recebimentos legados sem inventar autoria,
-- conta ou chave de uma operação histórica.
ALTER TABLE contas_receber
  ADD UNIQUE KEY uk_recebivel_id_empresa (id, id_empresa);
ALTER TABLE contas_bancarias
  ADD UNIQUE KEY uk_conta_bancaria_id_empresa (id, id_empresa);
ALTER TABLE pagamentos_receber
  ADD COLUMN id_usuario INT NULL,
  ADD COLUMN id_conta_bancaria INT NULL,
  ADD COLUMN chave_idempotencia VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN hash_requisicao CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN referencia VARCHAR(100) NULL,
  ADD UNIQUE KEY uk_pagamento_receber_empresa_chave (id_empresa, chave_idempotencia),
  ADD KEY idx_pagamento_receber_titulo_empresa (id_conta_receber, id_empresa),
  ADD KEY idx_pagamento_receber_banco_empresa (id_conta_bancaria, id_empresa),
  ADD KEY idx_pagamento_receber_usuario_empresa (id_usuario, id_empresa),
  ADD CONSTRAINT fk_pagamento_receber_titulo_empresa FOREIGN KEY (id_conta_receber, id_empresa)
    REFERENCES contas_receber (id, id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_pagamento_receber_banco_empresa FOREIGN KEY (id_conta_bancaria, id_empresa)
    REFERENCES contas_bancarias (id, id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_pagamento_receber_usuario_empresa FOREIGN KEY (id_usuario, id_empresa)
    REFERENCES usuario_empresa (id_usuario, id_empresa) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT ck_pagamento_receber_protocolo CHECK (
    (chave_idempotencia IS NULL AND hash_requisicao IS NULL) OR
    (chave_idempotencia IS NOT NULL AND hash_requisicao IS NOT NULL
      AND id_usuario IS NOT NULL AND id_conta_bancaria IS NOT NULL AND valor > 0)
  );
