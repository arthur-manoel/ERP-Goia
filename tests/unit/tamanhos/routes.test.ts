import { describe, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/tamanhos/route"
import * as item from "../../../src/app/api/tamanhos/[id]/route"
import { db } from "../../helpers/prisma"
import { context, request, origin } from "../../helpers/http"

const tamanho = {
  id: 1,
  id_empresa: 10,
  nome: "M",
  descricao: null,
  ordem: 0,
  status: "ATIVO",
}
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("detalhe interno", {
    code,
    clientVersion: "7.10.0",
  })
describe("/api/tamanhos", () => {
  it("lista com filtros, contagem, paginação e ordenação estável", async () => {
    db.tamanhos.findMany.mockResolvedValue([tamanho])
    db.tamanhos.count.mockResolvedValue(21)
    const response = await collection.GET(
      await request(
        "/api/tamanhos?page=2&limit=20&id_empresa=10&status=ATIVO&nome=M",
      ),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: { rows: [tamanho], count: 21, page: 2, limit: 20, totalPages: 2 },
    })
    expect(db.tamanhos.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id_empresa: 10, status: "ATIVO", nome: "M" },
          { id_empresa: { in: [10] } },
        ],
      },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }, { id: "asc" }],
      skip: 20,
      take: 20,
    })
  })
  it.each(["page=0", "limit=101", "status=OUTRO", "page=1&page=2", "nome="])(
    "rejeita query %s",
    async (query) => {
      const response = await collection.GET(
        await request(`/api/tamanhos?${query}`),
      )
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBeTruthy()
    },
  )
  it("cria usando os defaults do modelo atual", async () => {
    db.tamanhos.create.mockResolvedValue(tamanho)
    const response = await collection.POST(
      await request("/api/tamanhos", "POST", { id_empresa: 10, nome: " M " }),
    )
    expect(response.status).toBe(201)
    expect(db.tamanhos.create).toHaveBeenCalledWith({
      data: { id_empresa: 10, nome: "M", ordem: 0, status: "ATIVO" },
    })
    expect((await response.json()).data).toEqual(tamanho)
  })
  it.each([
    { nome: "M" },
    { id_empresa: 10 },
    { id_empresa: 10, nome: "M", ordem: null },
    { id_empresa: 10, nome: "M", id: 9 },
    { id_empresa: 10, nome: "x".repeat(51) },
  ])("rejeita criação inválida %j", async (input) => {
    expect(
      (await collection.POST(await request("/api/tamanhos", "POST", input)))
        .status,
    ).toBe(400)
    expect(db.tamanhos.create).not.toHaveBeenCalled()
  })
  it("rejeita JSON quebrado", async () => {
    const valid = await request("/api/tamanhos", "POST")
    const malformed = new Request(origin + "/api/tamanhos", {
      method: "POST",
      headers: valid.headers,
      body: "{",
    })
    expect((await collection.POST(malformed)).status).toBe(400)
  })
  it.each([
    ["P2002", 409],
    ["P2003", 400],
  ])("traduz erro %s para %i", async (code, status) => {
    db.tamanhos.create.mockRejectedValue(knownError(String(code)))
    expect(
      (
        await collection.POST(
          await request("/api/tamanhos", "POST", { id_empresa: 10, nome: "M" }),
        )
      ).status,
    ).toBe(status)
  })
  it("não revela detalhes de falhas inesperadas", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    db.tamanhos.findMany.mockRejectedValue(new Error("senha-do-banco"))
    const response = await collection.GET(await request("/api/tamanhos"))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      success: false,
      error: "Erro interno do servidor.",
    })
    expect(log).toHaveBeenCalled()
  })
})
describe("/api/tamanhos/:id", () => {
  it("busca por ID", async () => {
    db.tamanhos.findFirst.mockResolvedValue(tamanho)
    const response = await item.GET(await request("/api/tamanhos/1"), context())
    expect(response.status).toBe(200)
    expect((await response.json()).data).toEqual(tamanho)
  })
  it("retorna 404 quando não existe", async () => {
    db.tamanhos.findFirst.mockResolvedValue(null)
    expect(
      (await item.GET(await request("/api/tamanhos/1"), context())).status,
    ).toBe(404)
  })
  it("valida ID", async () => {
    expect(
      (await item.GET(await request("/api/tamanhos/abc"), context("abc")))
        .status,
    ).toBe(400)
  })
  it("atualiza parcialmente sem reativar um tamanho inativo", async () => {
    db.tamanhos.update.mockResolvedValue({
      ...tamanho,
      descricao: null,
      status: "INATIVO",
    })
    const response = await item.PUT(
      await request("/api/tamanhos/1", "PUT", { descricao: null }),
      context(),
    )
    expect(response.status).toBe(200)
    expect(db.tamanhos.update).toHaveBeenCalledWith({
      where: { id: 1, id_empresa: { in: [10] } },
      data: { descricao: null },
    })
    expect((await response.json()).data.status).toBe("INATIVO")
  })
  it.each([{}, { id: 2 }, { ordem: 0.5 }, { status: "OUTRO" }])(
    "rejeita atualização inválida %j",
    async (input) => {
      expect(
        (
          await item.PUT(
            await request("/api/tamanhos/1", "PUT", input),
            context(),
          )
        ).status,
      ).toBe(400)
    },
  )
  it("retorna conflito ao renomear para nome já existente na empresa", async () => {
    db.tamanhos.update.mockRejectedValue(knownError("P2002"))
    expect(
      (
        await item.PUT(
          await request("/api/tamanhos/1", "PUT", { nome: "G" }),
          context(),
        )
      ).status,
    ).toBe(409)
  })
  it("traduz desaparecimento concorrente em 404", async () => {
    db.tamanhos.update.mockRejectedValue(knownError("P2025"))
    expect(
      (
        await item.PUT(
          await request("/api/tamanhos/1", "PUT", { ordem: 2 }),
          context(),
        )
      ).status,
    ).toBe(404)
    expect(
      (await item.DELETE(await request("/api/tamanhos/1", "DELETE"), context()))
        .status,
    ).toBe(404)
  })
  it("exclui logicamente, inclusive quando já inativo", async () => {
    db.tamanhos.update.mockResolvedValue({ ...tamanho, status: "INATIVO" })
    const response = await item.DELETE(
      await request("/api/tamanhos/1", "DELETE"),
      context(),
    )
    expect(response.status).toBe(200)
    expect(db.tamanhos.update).toHaveBeenCalledWith({
      where: { id: 1, id_empresa: { in: [10] } },
      data: { status: "INATIVO" },
    })
    expect(await response.json()).toEqual({
      success: true,
      data: { message: "Tamanho inativado com sucesso." },
    })
  })
})
