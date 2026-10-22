-- Permite conceder permissões financeiras por operação a usuários vinculados.
ALTER TABLE `permissoes_usuario`
  MODIFY COLUMN `recurso` ENUM(
    'PRODUTOS',
    'ESTOQUE',
    'NOTAS_FISCAIS',
    'ORDENS_PRODUCAO',
    'CORES',
    'MODELOS',
    'CATEGORIAS',
    'CLIENTES',
    'PEDIDOS',
    'FINANCEIRO'
  ) NOT NULL;
