import { expect, it } from "vitest"
import {
  lerPedido,
  rascunhoPedidoSchema,
  itemPedidoInputSchema,
  podeDescartarTentativa,
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
it("preserva a chave de uma criação incerta mesmo se a recuperação retornar recusa", () => {
  for (const status of [400, 401, 403, 404, 409, 429, 500]) {
    expect(podeDescartarTentativa(status, true)).toBe(false)
  }
  expect(podeDescartarTentativa(400, false)).toBe(true)
  expect(podeDescartarTentativa(409, false)).toBe(true)
  expect(podeDescartarTentativa(500, false)).toBe(false)
})
it("edição e inclusão de itens validam quantidade e limites de identidade", () => {
  expect(
    itemPedidoInputSchema.safeParse({
      ...rascunho.itens[0],
      quantidade: "0.000",
    }).success,
  ).toBe(false)
  expect(
    itemPedidoInputSchema.safeParse({
      ...rascunho.itens[0],
      idProduto: 2147483648,
    }).success,
  ).toBe(false)
})
it("trata resposta não JSON sem perder a orientação para consultar a operação", async () => {
  await expect(
    lerPedido(new Response("<html>Falha no proxy</html>", { status: 502 })),
  ).rejects.toThrow("Consulte novamente")
})
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
