import { expect, it } from "vitest"
import * as collection from "../../../src/app/api/produtos/route"
import * as item from "../../../src/app/api/produtos/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"

it("permite as cinco operações sem cookies ou credenciais", async () => {
  const produto = { id: 1, codigo: "P1", nome: "Produto", status: "ATIVO" }
  db.produtos.findMany.mockResolvedValue([produto])
  db.produtos.count.mockResolvedValue(1)
  db.produtos.findUnique.mockResolvedValue(produto)
  db.produtos.findFirst.mockResolvedValue(null)
  db.produtos.create.mockResolvedValue(produto)
  db.produtos.update.mockResolvedValue(produto)
  expect((await collection.GET(await request("/api/produtos"))).status).toBe(
    200,
  )
  expect(
    (
      await collection.POST(
        await request("/api/produtos", "POST", {
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
