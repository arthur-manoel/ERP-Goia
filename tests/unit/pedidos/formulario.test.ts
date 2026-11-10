import { expect, it } from "vitest"
import {
  lerPedido,
  rascunhoPedidoSchema,
} from "../../../src/features/pedidos/api"

const rascunho = {
  idCliente: 1,
  dataEntregaPrevista: "2026-11-20",
  observacao: null,
  itens: [
    {
      idProduto: 2,
      idVariacao: null,
      quantidade: "0.001",
      precoPraticado: "0.00",
    },
  ],
}
it("preserva a precisão e aceita preços zero permitidos pelo contrato", () => {
  expect(rascunhoPedidoSchema.parse(rascunho)).toEqual(rascunho)
  for (const quantidade of ["0", "0.000", "1,5", "1e3", "1.0001"]) {
    expect(
      rascunhoPedidoSchema.safeParse({
        ...rascunho,
        itens: [{ ...rascunho.itens[0], quantidade }],
      }).success,
    ).toBe(false)
  }
})
it("rejeita tentativa recuperada incompleta e expõe conflitos retornados pelo servidor", async () => {
  expect(rascunhoPedidoSchema.safeParse({ idCliente: 1 }).success).toBe(false)
  await expect(
    lerPedido(
      Response.json(
        { error: "Pedido foi alterado. Consulte a versão atual." },
        { status: 409 },
      ),
    ),
  ).rejects.toThrow("Consulte a versão atual")
})
