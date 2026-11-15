-- Permite vendas de balcão sem cadastro de cliente e mantém as FKs compostas.
ALTER TABLE `venda`
  DROP FOREIGN KEY `fk_venda_cliente_empresa`;

ALTER TABLE `pedido_cliente_fechamento`
  DROP FOREIGN KEY `fk_fechamento_venda`;

ALTER TABLE `venda`
  MODIFY `id_cliente` INT NULL;

ALTER TABLE `venda`
  ADD CONSTRAINT `fk_venda_cliente_empresa`
    FOREIGN KEY (`id_empresa`, `id_cliente`)
    REFERENCES `clientes` (`id_empresa`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `pedido_cliente_fechamento`
  ADD CONSTRAINT `fk_fechamento_venda`
    FOREIGN KEY (`id_venda`, `id_empresa`, `id_cliente`, `id_pedido_cliente`)
    REFERENCES `venda` (`id`, `id_empresa`, `id_cliente`, `id_pedido_cliente`)
    ON DELETE RESTRICT ON UPDATE RESTRICT;
