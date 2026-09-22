import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/cores/route"
import * as item from "../../../src/app/api/cores/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context, origin } from "../../helpers/http"

const cor = {
  id: 1,
  id_empresa: 10,
  nome: "Branco",
  codigo_hex: "#FFFFFF",
  status: "ATIVA",
}
const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("detalhe interno", {
    code,
    clientVersion: "7.10.0",
  })
it("lista sem autenticação com filtros, paginação e ordenação estável", async () => {
  db.cores.findMany.mockResolvedValue([cor])
  db.cores.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/cores?page=2&limit=20&id_empresa=10&nome=Branco&status=ATIVA",
    ),
  )
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    data: { rows: [cor], count: 21, page: 2, limit: 20, totalPages: 2 },
  })
  expect(db.cores.findMany).toHaveBeenCalledWith({
    where: { id_empresa: 10, nome: "Branco", status: "ATIVA" },
    orderBy: [{ nome: "asc" }, { id: "asc" }],
    skip: 20,
    take: 20,
  })
})
it("cria normalizando hexadecimal e aplicando status default", async () => {
  db.cores.create.mockResolvedValue(cor)
  const response = await collection.POST(
    await request("/api/cores", "POST", {
      id_empresa: 10,
      nome: " Branco ",
      codigo_hex: "#ffffff",
    }),
  )
  expect(response.status).toBe(201)
  expect(db.cores.create).toHaveBeenCalledWith({
    data: {
      id_empresa: 10,
      nome: "Branco",
      codigo_hex: "#FFFFFF",
      status: "ATIVA",
    },
  })
})
it.each([
  { nome: "Branco" },
  { id_empresa: null, nome: "Branco" },
  { id_empresa: 10, nome: "" },
  { id_empresa: 10, nome: "Branco", codigo_hex: "#FFF" },
  { id_empresa: 10, nome: "Branco", status: "ATIVO" },
  { id_empresa: 10, nome: "Branco", id: 2 },
])("rejeita criação inválida %j", async (input) => {
  expect(
    (await collection.POST(await request("/api/cores", "POST", input))).status,
  ).toBe(400)
  expect(db.cores.create).not.toHaveBeenCalled()
})
it.each([
  "page=0",
  "page=1&page=2",
  "limit=101",
  "id_empresa=abc",
  "status=ATIVO",
])("rejeita filtro %s", async (query) => {
  expect(
    (await collection.GET(await request(`/api/cores?${query}`))).status,
  ).toBe(400)
})
it("retorna 400 para JSON inválido", async () => {
  expect(
    (
      await collection.POST(
        new Request(origin + "/api/cores", { method: "POST", body: "{" }),
      )
    ).status,
  ).toBe(400)
})
it("consulta registro existente inclusive com empresa legada nula", async () => {
  db.cores.findUnique.mockResolvedValue({ ...cor, id_empresa: null })
  const response = await item.GET(await request("/api/cores/1"), context())
  expect(response.status).toBe(200)
  expect((await response.json()).data.id_empresa).toBeNull()
})
it("retorna 404 para ID inexistente e 400 para ID inválido", async () => {
  db.cores.findUnique.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/cores/1"), context())).status,
  ).toBe(404)
  expect(
    (await item.GET(await request("/api/cores/abc"), context("abc"))).status,
  ).toBe(400)
})
it("atualiza parcialmente, permite limpar hex e preserva status", async () => {
  db.cores.update.mockResolvedValue({
    ...cor,
    codigo_hex: null,
    status: "INATIVA",
  })
  const response = await item.PUT(
    await request("/api/cores/1", "PUT", { codigo_hex: null }),
    context(),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data.status).toBe("INATIVA")
  expect(db.cores.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { codigo_hex: null },
  })
})
it.each([{}, { id: 2 }, { id_empresa: null }, { codigo_hex: "FFFFFF" }])(
  "rejeita atualização inválida %j",
  async (input) => {
    expect(
      (await item.PUT(await request("/api/cores/1", "PUT", input), context()))
        .status,
    ).toBe(400)
  },
)
it.each([
  ["P2002", 409],
  ["P2003", 400],
  ["P2000", 400],
])("traduz %s em %i nas escritas", async (code, status) => {
  db.cores.create.mockRejectedValue(knownError(String(code)))
  db.cores.update.mockRejectedValue(knownError(String(code)))
  expect(
    (
      await collection.POST(
        await request("/api/cores", "POST", { id_empresa: 10, nome: "Branco" }),
      )
    ).status,
  ).toBe(status)
  expect(
    (
      await item.PUT(
        await request("/api/cores/1", "PUT", { nome: "Branco" }),
        context(),
      )
    ).status,
  ).toBe(status)
})
it("inativa sem excluir fisicamente", async () => {
  db.cores.update.mockResolvedValue({ ...cor, status: "INATIVA" })
  const response = await item.DELETE(
    await request("/api/cores/1", "DELETE"),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.cores.update).toHaveBeenCalledWith({
    where: { id: 1 },
    data: { status: "INATIVA" },
  })
  expect((await response.json()).data.message).toBe(
    "Cor inativada com sucesso.",
  )
})
it("traduz desaparecimento concorrente em 404", async () => {
  db.cores.update.mockRejectedValue(knownError("P2025"))
  expect(
    (
      await item.PUT(
        await request("/api/cores/1", "PUT", { nome: "Azul" }),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(
    (await item.DELETE(await request("/api/cores/1", "DELETE"), context()))
      .status,
  ).toBe(404)
})
it("oculta falhas inesperadas", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.cores.findUnique.mockRejectedValue(new Error("interno"))
  const response = await item.GET(await request("/api/cores/1"), context())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})
