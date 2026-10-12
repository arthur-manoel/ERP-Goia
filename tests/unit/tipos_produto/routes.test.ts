import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/tipos_produto/route"
import * as item from "../../../src/app/api/tipos_produto/[id]/route"
import { db } from "../../helpers/prisma"
import { context, origin, request } from "../../helpers/http"

const row = { id: 1, nome: "Matéria-prima", descricao: "Insumos" }
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("detalhe interno", {
    code,
    clientVersion: "7.10.0",
  })

it("lista uma página e conta os registros com o mesmo filtro", async () => {
  db.tipos_produto.findMany.mockResolvedValue([row])
  db.tipos_produto.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request("/api/tipos_produto?page=2&limit=20&nome=Matéria-prima"),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { rows: [row], count: 21, page: 2, limit: 20, totalPages: 2 },
  })
  const where = { nome: "Matéria-prima" }
  expect(db.tipos_produto.findMany).toHaveBeenCalledWith({
    where,
    orderBy: [{ nome: "asc" }, { id: "asc" }],
    skip: 20,
    take: 20,
  })
  expect(db.tipos_produto.count).toHaveBeenCalledWith({ where })
})

it("cria tipo, verifica unicidade e traduz duplicidade concorrente", async () => {
  db.tipos_produto.findFirst.mockResolvedValue(null)
  db.tipos_produto.create.mockResolvedValue(row)
  expect(
    (
      await collection.POST(
        await request("/api/tipos_produto", "POST", {
          nome: row.nome,
          descricao: row.descricao,
        }),
      )
    ).status,
  ).toBe(201)
  expect(db.tipos_produto.create).toHaveBeenCalledWith({
    data: { nome: "Matéria-prima", descricao: "Insumos" },
  })
  db.tipos_produto.findFirst.mockResolvedValue(row)
  expect(
    (
      await collection.POST(
        await request("/api/tipos_produto", "POST", {
          nome: row.nome,
          descricao: row.descricao,
        }),
      )
    ).status,
  ).toBe(409)
  db.tipos_produto.findFirst.mockResolvedValue(null)
  db.tipos_produto.create.mockRejectedValue(knownError("P2002"))
  expect(
    (
      await collection.POST(
        await request("/api/tipos_produto", "POST", {
          nome: row.nome,
          descricao: row.descricao,
        }),
      )
    ).status,
  ).toBe(409)
})

it("GET por ID retorna 404 se não existir", async () => {
  db.tipos_produto.findUnique.mockResolvedValue(row)
  expect(
    (await item.GET(await request("/api/tipos_produto/1"), context())).status,
  ).toBe(200)
  db.tipos_produto.findUnique.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/tipos_produto/1"), context())).status,
  ).toBe(404)
})

it("PUT substitui a descrição e PATCH atualiza somente o campo enviado", async () => {
  db.tipos_produto.findFirst.mockResolvedValue(null)
  db.tipos_produto.update.mockResolvedValue(row)
  expect(
    (
      await item.PUT(
        await request("/api/tipos_produto/1", "PUT", { nome: "Novo" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.tipos_produto.update).toHaveBeenLastCalledWith({
    where: { id: 1 },
    data: { nome: "Novo", descricao: null },
  })
  expect(
    (
      await item.PATCH(
        await request("/api/tipos_produto/1", "PATCH", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.tipos_produto.update).toHaveBeenLastCalledWith({
    where: { id: 1 },
    data: { descricao: "Nova" },
  })
})

it("bloqueia remoção de tipo em uso e remove tipo sem histórico", async () => {
  db.produtos.count.mockResolvedValue(1)
  expect(
    (
      await item.DELETE(
        await request("/api/tipos_produto/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(409)
  db.produtos.count.mockResolvedValue(0)
  db.tipos_produto.delete.mockResolvedValue(row)
  const response = await item.DELETE(
    await request("/api/tipos_produto/1", "DELETE", undefined),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.tipos_produto.delete).toHaveBeenCalledWith({ where: { id: 1 } })
})

it("valida JSON, campos imutáveis e parâmetros de consulta", async () => {
  expect(
    (
      await item.PATCH(
        await request("/api/tipos_produto/1", "PATCH", { id: 2 }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (await collection.GET(await request("/api/tipos_produto?page=1&page=2")))
      .status,
  ).toBe(400)
  expect(
    (
      await collection.POST(
        new Request(origin + "/api/tipos_produto", {
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400)
})

it("oculta falhas inesperadas", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.tipos_produto.findUnique.mockRejectedValue(new Error("interno"))
  const response = await item.GET(
    await request("/api/tipos_produto/1"),
    context(),
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})
