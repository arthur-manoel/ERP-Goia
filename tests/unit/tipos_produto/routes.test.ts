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

const protectedOperations = [
  ["GET lista", (req: Request) => collection.GET(req)],
  ["POST cria", (req: Request) => collection.POST(req)],
  ["GET por ID", (req: Request) => item.GET(req, context())],
  ["PUT", (req: Request) => item.PUT(req, context())],
  ["PATCH", (req: Request) => item.PATCH(req, context())],
  ["DELETE", (req: Request) => item.DELETE(req, context())],
] as const

it.each(protectedOperations)(
  "%s rejeita requisição sem token",
  async (_, invoke) => {
    const req = await request("/api/tipos_produto", "GET")
    req.headers.delete("Authorization")

    const response = await invoke(req)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      success: false,
      error: "Não autenticado.",
    })
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    expect(db.tipos_produto.findMany).not.toHaveBeenCalled()
    expect(db.tipos_produto.create).not.toHaveBeenCalled()
    expect(db.tipos_produto.update).not.toHaveBeenCalled()
  },
)

it.each(protectedOperations)(
  "%s rejeita usuário sem empresa/permissão",
  async (_, invoke) => {
    db.usuario_empresa.findMany.mockResolvedValue([])

    const response = await invoke(await request("/api/tipos_produto", "GET"))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      success: false,
      error: "Sem vínculo ativo ou permissão para esta operação.",
    })
    expect(db.tipos_produto.findMany).not.toHaveBeenCalled()
    expect(db.tipos_produto.create).not.toHaveBeenCalled()
    expect(db.tipos_produto.update).not.toHaveBeenCalled()
    expect(db.tipos_produto.delete).not.toHaveBeenCalled()
  },
)

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
  const where = { nome: "Matéria-prima", status: "ATIVO" }
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
  db.tipos_produto.findUnique.mockResolvedValue(row)
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

it("prioriza 404 para ID inexistente antes de verificar nome duplicado", async () => {
  db.tipos_produto.findUnique.mockResolvedValue(null)
  db.tipos_produto.findFirst.mockResolvedValue(row)

  expect(
    (
      await item.PATCH(
        await request("/api/tipos_produto/999", "PATCH", { nome: row.nome }),
        context("999"),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await item.PUT(
        await request("/api/tipos_produto/999", "PUT", { nome: row.nome }),
        context("999"),
      )
    ).status,
  ).toBe(404)
  expect(db.tipos_produto.findFirst).not.toHaveBeenCalled()
  expect(db.tipos_produto.update).not.toHaveBeenCalled()
})

it("inativa sem apagar tipo vinculado ao histórico", async () => {
  db.tipos_produto.update.mockResolvedValue({ ...row, status: "INATIVO" })
  const response = await item.DELETE(
    await request("/api/tipos_produto/1", "DELETE", undefined),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.tipos_produto.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { status: "INATIVO" },
  })
  expect((await response.json()).data.message).toBe(
    "Tipo de produto inativado com sucesso.",
  )

  db.tipos_produto.update.mockRejectedValueOnce(knownError("P2025"))
  expect(
    (
      await item.DELETE(
        await request("/api/tipos_produto/999", "DELETE"),
        context("999"),
      )
    ).status,
  ).toBe(404)
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
