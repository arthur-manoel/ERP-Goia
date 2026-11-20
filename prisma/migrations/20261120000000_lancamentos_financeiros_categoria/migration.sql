-- DB-first: categoria explícita para novos lançamentos manuais.
-- Movimentos legados preservam os vínculos e dados existentes.
ALTER TABLE movimentacoes_financeiras
  ADD COLUMN id_categoria INT NULL,
  ADD INDEX idx_mov_fin_categoria_empresa (id_categoria, id_empresa),
  ADD CONSTRAINT fk_mov_fin_categoria_empresa
    FOREIGN KEY (id_categoria, id_empresa)
    REFERENCES categoria_financeira (id, id_empresa)
    ON UPDATE RESTRICT ON DELETE RESTRICT;
