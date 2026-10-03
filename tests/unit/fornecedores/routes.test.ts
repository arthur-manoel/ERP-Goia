import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/fornecedores/route"
import * as item from "../../../src/app/api/fornecedores/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context, origin } from "../../helpers/http"

const row = {
  id: 1,
  id_empresa: 10,
  razao_social: "Empresa",
  nome_fantasia: "Loja",
  cnpj: "11222333000181",
  status: "ATIVO",
}
const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("interno", {
    code,
    clientVersion: "7.10.0",
  })
beforeEach(() => {
  db.fornecedores.findUnique.mockResolvedValue(row)
  db.fornecedores.findFirst.mockResolvedValue(null)
})
it("lista com todos os filtros e paginação, na mesma transação", async () => {
  db.fornecedores.findMany.mockResolvedValue([row])
  db.fornecedores.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/fornecedores?page=2&limit=20&id_empresa=10&status=ATIVO&razao_social=Empresa&nome_fantasia=Loja",
    ),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { rows: [row], count: 21, page: 2, limit: 20, totalPages: 2 },
  })
  expect(db.fornecedores.findMany).toHaveBeenCalledWith({
    where: {
      id_empresa: 10,
      status: "ATIVO",
      razao_social: "Empresa",
      nome_fantasia: "Loja",
    },
    orderBy: [{ razao_social: "asc" }, { id: "asc" }],
    skip: 20,
    take: 20,
  })
  expect(db.$transaction).toHaveBeenCalledOnce()
})
it("cria sem CNPJ e sem data manual", async () => {
  db.fornecedores.create.mockResolvedValue(row)
  const response = await collection.POST(
    await request("/api/fornecedores", "POST", {
      id_empresa: 10,
      razao_social: "Empresa",
    }),
  )
  expect(response.status).toBe(201)
  expect(db.fornecedores.create).toHaveBeenCalledWith({
    data: { id_empresa: 10, razao_social: "Empresa", status: "ATIVO" },
  })
  expect(db.fornecedores.findFirst).not.toHaveBeenCalled()
})
it("pesquisa CNPJ com e sem máscara e grava forma canônica", async () => {
  db.fornecedores.create.mockResolvedValue(row)
  const response = await collection.POST(
    await request("/api/fornecedores", "POST", {
      id_empresa: 10,
      razao_social: "Empresa",
      cnpj: "11.222.333/0001-81",
    }),
  )
  expect(response.status).toBe(201)
  expect(db.fornecedores.findFirst).toHaveBeenCalledWith({
    where: {
      id_empresa: 10,
      cnpj: { in: ["11222333000181", "11.222.333/0001-81"] },
    },
  })
  expect(db.fornecedores.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ cnpj: row.cnpj }),
  })
})
it("retorna 409 para duplicata existente, inclusive inativa", async () => {
  db.fornecedores.findFirst.mockResolvedValue({ ...row, status: "INATIVO" })
  const response = await collection.POST(
    await request("/api/fornecedores", "POST", {
      id_empresa: 10,
      razao_social: "Empresa",
      cnpj: row.cnpj,
    }),
  )
  expect(response.status).toBe(409)
  expect((await response.json()).error).toContain("CNPJ nesta empresa")
  expect(db.fornecedores.create).not.toHaveBeenCalled()
})
it("consulta por ID ou retorna 404", async () => {
  expect(
    (await item.GET(await request("/api/fornecedores/1"), context())).status,
  ).toBe(200)
  db.fornecedores.findUnique.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/fornecedores/1"), context())).status,
  ).toBe(404)
})
it("preserva status omitido e permite limpar CNPJ", async () => {
  db.fornecedores.update.mockResolvedValue({
    ...row,
    cnpj: null,
    status: "INATIVO",
  })
  const response = await item.PUT(
    await request("/api/fornecedores/1", "PUT", { cnpj: null }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.fornecedores.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { cnpj: null },
  })
  expect(db.fornecedores.findFirst).not.toHaveBeenCalled()
})
it.each([{ cnpj: "11.222.333/0001-81" }, { id_empresa: 20 }])(
  "verifica unicidade da combinação resultante no PUT %j",
  async (data) => {
    db.fornecedores.findFirst.mockResolvedValue({ ...row, id: 2 })
    const response = await item.PUT(
      await request("/api/fornecedores/1", "PUT", data),
      context(),
    )
    expect(response.status).toBe(409)
    expect(db.fornecedores.findFirst).toHaveBeenCalledWith({
      where: {
        id_empresa: "id_empresa" in data ? 20 : 10,
        id: { not: 1 },
        cnpj: { in: ["11222333000181", "11.222.333/0001-81"] },
      },
    })
    expect(db.fornecedores.update).not.toHaveBeenCalled()
  },
)
it("aceita o próprio CNPJ e trata empresa nula legada", async () => {
  db.fornecedores.findUnique.mockResolvedValue({ ...row, id_empresa: null })
  db.fornecedores.update.mockResolvedValue(row)
  expect(
    (
      await item.PUT(
        await request("/api/fornecedores/1", "PUT", { cnpj: row.cnpj }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.fornecedores.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id_empresa: null, id: { not: 1 } }),
    }),
  )
})
it.each([
  ["P2002", 409],
  ["P2003", 400],
  ["P2000", 400],
])("traduz erro %s para %i", async (code, status) => {
  db.fornecedores.create.mockRejectedValue(error(String(code)))
  db.fornecedores.update.mockRejectedValue(error(String(code)))
  expect(
    (
      await collection.POST(
        await request("/api/fornecedores", "POST", {
          id_empresa: 10,
          razao_social: "Empresa",
        }),
      )
    ).status,
  ).toBe(status)
  expect(
    (
      await item.PUT(
        await request("/api/fornecedores/1", "PUT", { razao_social: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(status)
})
it("retorna 404 no PUT inexistente e em desaparecimento concorrente", async () => {
  db.fornecedores.findUnique.mockResolvedValueOnce(null)
  expect(
    (
      await item.PUT(
        await request("/api/fornecedores/1", "PUT", { nome_fantasia: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(404)
  db.fornecedores.update.mockRejectedValue(error("P2025"))
  expect(
    (
      await item.PUT(
        await request("/api/fornecedores/1", "PUT", { nome_fantasia: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(
    (
      await item.DELETE(
        await request("/api/fornecedores/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(404)
})
it("inativa preservando o histórico e aceita repetição", async () => {
  db.fornecedores.update.mockResolvedValue({ ...row, status: "INATIVO" })
  for (let i = 0; i < 2; i++) {
    const response = await item.DELETE(
      await request("/api/fornecedores/1", "DELETE"),
      context(),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Fornecedor inativado com sucesso." },
    })
  }
  expect(db.fornecedores.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { status: "INATIVO" },
  })
})
it("rejeita IDs, campos imutáveis, query repetida e JSON inválido", async () => {
  expect(
    (await item.GET(await request("/api/fornecedores/abc"), context("abc")))
      .status,
  ).toBe(400)
  expect(
    (
      await item.PUT(
        await request("/api/fornecedores/1", "PUT", { id: 2 }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (await collection.GET(await request("/api/fornecedores?page=1&page=2")))
      .status,
  ).toBe(400)
  expect(
    (
      await collection.POST(
        new Request(origin + "/api/fornecedores", {
          method: "POST",
          body: "{",
        }),
      )
    ).status,
  ).toBe(400)
})
it("retorna 500 genérico e registra erro inesperado", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  db.fornecedores.findUnique.mockRejectedValue(new Error("detalhes internos"))
  const response = await item.GET(
    await request("/api/fornecedores/1"),
    context(),
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
  expect(log).toHaveBeenCalled()
})
