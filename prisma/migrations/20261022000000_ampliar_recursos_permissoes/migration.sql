-- Expansão aditiva: manter a ordem dos valores existentes do ENUM.
-- Não cria concessões nem copia permissões entre recursos.
ALTER TABLE `permissoes_usuario`
  MODIFY COLUMN `recurso` ENUM(
    'PRODUTOS', 'ESTOQUE', 'NOTAS_FISCAIS', 'ORDENS_PRODUCAO', 'CORES',
    'MODELOS', 'CATEGORIAS', 'CLIENTES', 'PEDIDOS', 'FINANCEIRO',
    'COMPRAS', 'FORNECEDORES', 'SETORES', 'VENDAS', 'RELATORIOS',
    'FLUXOS_PRODUCAO', 'TAMANHOS', 'TIPOS_PRODUTO'
  ) NOT NULL;
