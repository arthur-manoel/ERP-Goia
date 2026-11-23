-- A UNIQUE uk_empresa_cnpj existente impede colisões durante a normalização.
-- Execute primeiro a consulta de diagnóstico descrita no README do módulo.
UPDATE empresas
SET cnpj = REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '')
WHERE cnpj REGEXP '^[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2}$';

ALTER TABLE empresas
  ADD COLUMN created_at TIMESTAMP NULL,
  ADD COLUMN updated_at TIMESTAMP NULL,
  ADD COLUMN inativado_em TIMESTAMP NULL,
  ADD COLUMN inativado_por INT NULL,
  ADD INDEX idx_empresa_razao_id (razao_social, id),
  ADD INDEX idx_empresa_status_razao_id (status, razao_social, id),
  ADD INDEX fk_empresa_inativador (inativado_por),
  ADD CONSTRAINT fk_empresa_inativador FOREIGN KEY (inativado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE empresas SET created_at = data_cadastro, updated_at = data_cadastro;
ALTER TABLE empresas
  MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE permissoes_usuario
  MODIFY recurso ENUM('PRODUTOS', 'ESTOQUE', 'NOTAS_FISCAIS', 'ORDENS_PRODUCAO', 'CORES', 'MODELOS', 'CATEGORIAS', 'CLIENTES', 'PEDIDOS', 'FINANCEIRO', 'COMPRAS', 'FORNECEDORES', 'SETORES', 'VENDAS', 'RELATORIOS', 'FLUXOS_PRODUCAO', 'TAMANHOS', 'TIPOS_PRODUTO', 'EMPRESAS') NOT NULL;
