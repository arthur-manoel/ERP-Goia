-- Permite vendas de balcão sem cadastro de cliente e mantém as FKs compostas.
ALTER TABLE `venda`
  MODIFY `id_cliente` INT NULL;
