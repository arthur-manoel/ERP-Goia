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

it.each([10, 20])(
  "confere todos os vínculos na escrita global com empresa ativa %i",
  async (empresa) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      { id_empresa: 10 },
      { id_empresa: 20 },
    ])
    db.produtos.update.mockResolvedValue({ id: 1 })
    const req = await request("/api/produtos/1", "PATCH", {
      nome: "Compartilhado",
    })
    req.headers.set("X-Empresa-Id", String(empresa))
    expect((await item.PATCH(req, context())).status).toBe(200)
    expect(db.produtos.update).toHaveBeenCalledWith({
      where: {
        id: 1,
        produto_empresa: {
          some: { id_empresa: { in: [empresa] } },
          every: expect.objectContaining({
            id_empresa: { in: [10, 20] },
            empresas: {
              usuario_empresa: {
                some: expect.objectContaining({
                  OR: expect.arrayContaining([
                    {
                      permissoes_usuario: {
                        some: { recurso: "PRODUTOS", pode_editar: true },
                      },
                    },
                  ]),
                }),
              },
            },
          }),
        },
      },
      data: { nome: "Compartilhado" },
    })
  },
)

it("limita a inativação às empresas com edição e exclusão", async () => {
  db.usuario_empresa.findMany
    .mockResolvedValueOnce([{ id_empresa: 10 }, { id_empresa: 20 }])
    .mockResolvedValueOnce([{ id_empresa: 10 }])
  db.produtos.update.mockResolvedValue({ id: 1 })
  const req = await request("/api/produtos/1", "PATCH", { status: "INATIVO" })
  req.headers.set("X-Empresa-Id", "10")
  expect((await item.PATCH(req, context())).status).toBe(200)
  expect(db.produtos.update).toHaveBeenCalledWith({
    where: {
      id: 1,
      produto_empresa: {
        some: { id_empresa: { in: [10] } },
        every: expect.objectContaining({
          id_empresa: { in: [10] },
          empresas: {
            usuario_empresa: {
              some: expect.objectContaining({
                OR: expect.arrayContaining([
                  {
                    permissoes_usuario: {
                      some: {
                        recurso: "PRODUTOS",
                        pode_editar: true,
                        pode_excluir: true,
                      },
                    },
                  },
                ]),
              }),
            },
          },
        }),
      },
    },
    data: { status: "INATIVO" },
  })
})
