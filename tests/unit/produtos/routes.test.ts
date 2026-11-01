import { expect, it } from "vitest"
import * as collection from "../../../src/app/api/produtos/route"
import * as item from "../../../src/app/api/produtos/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"

it("permite as cinco operações com token e permissão", async () => {
  const produto = { id: 1, codigo: "P1", nome: "Produto", status: "ATIVO" }
  db.produtos.findMany.mockResolvedValue([produto])
  db.produtos.count.mockResolvedValue(1)
  db.produtos.findFirst.mockResolvedValue(produto)
  db.produtos.findFirst.mockResolvedValueOnce(null)
  db.produtos.create.mockResolvedValue(produto)
  db.produtos.update.mockResolvedValue(produto)
  expect((await collection.GET(await request("/api/produtos"))).status).toBe(
    200,
  )
  expect(
    (
      await collection.POST(
        await request("/api/produtos", "POST", {
          id_empresa: 10,
          codigo: "P1",
          nome: "Produto",
          id_tipo_produto: 1,
          unidade: "UN",
          controla_estoque: 1,
          permite_compra: 1,
          permite_venda: 1,
          permite_producao: 0,
        }),
      )
    ).status,
  ).toBe(201)
  expect(
    (await item.GET(await request("/api/produtos/1"), context())).status,
  ).toBe(200)
  expect(
    (
      await item.PUT(
        await request("/api/produtos/1", "PUT", { nome: "Novo" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(
    (await item.DELETE(await request("/api/produtos/1", "DELETE"), context()))
      .status,
  ).toBe(200)
})

// Uma posição/reserva preserva a unidade histórica mesmo que seu saldo seja zero.
it.each([
  "estoque",
  "reserva_estoque",
  "pedido_cliente_item",
  "consumo_producao",
])("impede trocar unidade quando há histórico em %s", async (relacao) => {
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.produtos.findFirst.mockResolvedValue({
    id: 1,
    unidade: "UN",
    produto_empresa: [{ id_empresa: 10 }],
  })
  db.produtos.findUnique.mockResolvedValue({ _count: { [relacao]: 1 } })
  const r = await item.PUT(
    await request("/api/produtos/1", "PUT", { unidade: "M" }),
    context(),
  )
  expect(r.status).toBe(409)
  expect(db.produtos.update).not.toHaveBeenCalled()
})
it("permite manter unidade e trocar unidade de produto sem histórico", async () => {
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.produtos.findFirst.mockResolvedValue({
    id: 1,
    unidade: "UN",
    produto_empresa: [{ id_empresa: 10 }],
  })
  db.produtos.findUnique.mockResolvedValue({
    _count: {
      estoque: 0,
      reserva_estoque: 0,
      ordem_producao_item: 0,
      ordem_producao_consumo_planejado: 0,
      consumo_producao: 0,
      pedido_cliente_item: 0,
    },
  })
  db.produtos.update.mockResolvedValue({ id: 1, unidade: "M" })
  expect(
    (
      await item.PUT(
        await request("/api/produtos/1", "PUT", { unidade: "M" }),
        context(),
      )
    ).status,
  ).toBe(200)
  db.produtos.findUnique.mockClear()
  expect(
    (
      await item.PUT(
        await request("/api/produtos/1", "PUT", { unidade: "UN" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.produtos.findUnique).not.toHaveBeenCalled()
})
