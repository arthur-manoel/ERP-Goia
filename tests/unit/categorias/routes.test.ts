import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/categorias/route"
import * as item from "../../../src/app/api/categorias/[id]/route"
import { db } from "../../helpers/prisma"
import { context, request } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"

const row = {
  id: 1,
  id_empresa: 10,
  nome: "Tecidos",
  descricao: "Para produção",
  status: "ATIVA",
}
beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([])
  db.empresas.findFirst.mockResolvedValue({ id: 10, status: "ATIVA" })
  db.categorias.findFirst.mockResolvedValue(row)
  db.categorias.create.mockResolvedValue(row)
  db.categorias.update.mockResolvedValue(row)
})
afterEach(() => resetRateLimitsForTests())

const operations = [
  ["listagem", "GET", "pode_ler", (req: Request) => collection.GET(req)],
  ["criação", "POST", "pode_criar", (req: Request) => collection.POST(req)],
  [
    "consulta por id",
    "GET",
    "pode_ler",
    (req: Request) => item.GET(req, context()),
  ],
  [
    "substituição",
    "PUT",
    "pode_editar",
    (req: Request) => item.PUT(req, context()),
  ],
  [
    "edição parcial",
    "PATCH",
    "pode_editar",
    (req: Request) => item.PATCH(req, context()),
  ],
  [
    "inativação",
    "DELETE",
    "pode_excluir",
    (req: Request) => item.DELETE(req, context()),
  ],
] as const

it.each(operations)(
  "%s valida token e permissão da operação antes de acessar os dados",
  async (_, method, action, invoke) => {
    const unauthenticated = await request("/api/categorias", method)
    unauthenticated.headers.delete("Authorization")
    expect((await invoke(unauthenticated)).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    const denied = await request("/api/categorias", method)
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await invoke(denied)).status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ATIVO",
          OR: expect.arrayContaining([
            {
              permissoes_usuario: {
                some: { recurso: "CATEGORIAS", [action]: true },
              },
            },
          ]),
        }),
      }),
    )
    expect(db.categorias.findFirst).not.toHaveBeenCalled()
    expect(db.categorias.create).not.toHaveBeenCalled()
  },
)

it("cria com empresa inferida e normaliza o nome dentro da transação", async () => {
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "  Tecido   Plano " }),
  )
  expect(response.status).toBe(201)
  expect(db.categorias.create).toHaveBeenCalledWith({
    data: {
      id_empresa: 10,
      nome: "Tecido Plano",
      descricao: null,
      status: "ATIVA",
    },
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "ReadCommitted",
  })
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.categorias.create.mock.invocationCallOrder[0],
  )
  expect(db.$queryRaw.mock.calls[1][0].sql).toContain("REGEXP_REPLACE")
})

it("exige empresa quando houver múltiplos vínculos autorizados", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "Tecidos" }),
  )
  expect(response.status).toBe(400)
  expect(db.categorias.create).not.toHaveBeenCalled()
})

it("rejeita empresa inexistente ou inativa", async () => {
  db.empresas.findFirst.mockResolvedValue(null)
  const response = await collection.POST(
    await request("/api/categorias", "POST", {
      nome: "Tecidos",
      id_empresa: 10,
    }),
  )
  expect(response.status).toBe(400)
  expect(db.categorias.create).not.toHaveBeenCalled()
})

it("recusa duplicidade ativa e permite duplicidade entre inativas", async () => {
  db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([row])
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "tecidos" }),
  )
  expect(response.status).toBe(409)
  expect(db.categorias.create).not.toHaveBeenCalled()

  const inactive = await collection.POST(
    await request("/api/categorias", "POST", {
      nome: "tecidos",
      status: "INATIVA",
    }),
  )
  expect(inactive.status).toBe(201)
})

it("pagina, filtra e ordena no banco mantendo o escopo empresarial", async () => {
  db.categorias.findMany.mockResolvedValue([row])
  db.categorias.count.mockResolvedValue(31)
  const response = await collection.GET(
    await request(
      "/api/categorias?page=2&limit=10&nome=Te&busca=cido&status=ATIVA&ordenar_por=id&ordem=desc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    rows: [row],
    count: 31,
    totalPages: 4,
    page: 2,
    limit: 10,
  })
  const query = db.categorias.findMany.mock.calls[0][0]
  expect(query).toMatchObject({ skip: 10, take: 10, orderBy: [{ id: "desc" }] })
  expect(query.where.AND).toContainEqual({ id_empresa: { in: [10] } })
  expect(db.categorias.count).toHaveBeenCalledWith({ where: query.where })
})

it("rejeita filtro ou gravação em empresa sem acesso", async () => {
  expect(
    (await collection.GET(await request("/api/categorias?id_empresa=99")))
      .status,
  ).toBe(403)
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", {
          nome: "Tecidos",
          id_empresa: 99,
        }),
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { id_empresa: 99 }),
        context(),
      )
    ).status,
  ).toBe(403)
  expect(db.categorias.findMany).not.toHaveBeenCalled()
  expect(db.categorias.update).not.toHaveBeenCalled()
})

it("consulta por ID oculta categorias de outra empresa", async () => {
  db.categorias.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/categorias/1"), context())).status,
  ).toBe(404)
  expect(db.categorias.findFirst).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
  })
})

it("PATCH preserva campos ausentes e PUT exige nome e restaura padrões", async () => {
  const patch = await item.PATCH(
    await request("/api/categorias/1", "PATCH", {
      descricao: "Nova descrição",
    }),
    context(),
  )
  expect(patch.status).toBe(200)
  expect(db.categorias.update).toHaveBeenLastCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
    data: { descricao: "Nova descrição" },
  })
  const invalidPut = await item.PUT(
    await request("/api/categorias/1", "PUT", { descricao: "Nova" }),
    context(),
  )
  expect(invalidPut.status).toBe(400)
  const put = await item.PUT(
    await request("/api/categorias/1", "PUT", { nome: "Aviamentos" }),
    context(),
  )
  expect(put.status).toBe(200)
  expect(db.categorias.update).toHaveBeenLastCalledWith(
    expect.objectContaining({
      data: { nome: "Aviamentos", descricao: null, status: "ATIVA" },
    }),
  )
})

it("retorna 404 antes de verificar duplicidade em edição de ID inexistente", async () => {
  db.categorias.findFirst.mockResolvedValue(null)
  const response = await item.PATCH(
    await request("/api/categorias/9", "PATCH", { nome: "Tecidos" }),
    context("9"),
  )
  expect(response.status).toBe(404)
  expect(db.$queryRaw).toHaveBeenCalledTimes(1) // Apenas bloqueio das empresas.
  expect(db.categorias.update).not.toHaveBeenCalled()
})

it("verifica duplicidade ao reativar", async () => {
  db.categorias.findFirst.mockResolvedValue({ ...row, status: "INATIVA" })
  db.$queryRaw
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...row, id: 2 }])
  const response = await item.PATCH(
    await request("/api/categorias/1", "PATCH", { status: "ATIVA" }),
    context(),
  )
  expect(response.status).toBe(409)
  expect(db.categorias.update).not.toHaveBeenCalled()
})

it("inativa mesmo com produtos vinculados, preservando o histórico", async () => {
  db.produtos.count.mockResolvedValue(7)
  const response = await item.DELETE(
    await request("/api/categorias/1", "DELETE"),
    context(),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data.produtos_vinculados).toBe(7)
  expect(db.produtos.count).toHaveBeenCalledWith({ where: { id_categoria: 1 } })
  expect(db.categorias.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: "INATIVA" } }),
  )
  expect(db.categorias.delete).not.toHaveBeenCalled()
  expect(db.produtos.delete).not.toHaveBeenCalled()
})

it("não transfere categorias com histórico a outra empresa", async () => {
  db.produtos.count.mockResolvedValue(1)
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { id_empresa: 20 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.categorias.update).not.toHaveBeenCalled()
})

it("permite transferir categoria sem produtos entre empresas autorizadas", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.produtos.count.mockResolvedValue(0)
  const response = await item.PATCH(
    await request("/api/categorias/1", "PATCH", { id_empresa: 20 }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.categorias.update).toHaveBeenLastCalledWith(
    expect.objectContaining({ data: { id_empresa: 20 } }),
  )
})

it.each([
  ["P2002", 409],
  ["P2003", 400],
  ["P2034", 409],
] as const)("traduz falha Prisma %s para HTTP %s", async (code, status) => {
  db.categorias.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("falha de banco", {
      code,
      clientVersion: "test",
    }),
  )
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "Tecidos" }),
  )
  expect(response.status).toBe(status)
})

it("captura falhas inesperadas com resposta genérica", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.categorias.findFirst.mockRejectedValue(new Error("segredo"))
  const response = await item.GET(await request("/api/categorias/1"), context())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})

it("traduz disputa do adapter Prisma 7 para 409", async () => {
  db.categorias.create.mockRejectedValue({
    name: "DriverAdapterError",
    cause: { kind: "TransactionWriteConflict", originalCode: "1213" },
  })
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "Tecidos" }),
  )
  expect(response.status).toBe(409)
})

it("audita criação e edição com o autor autenticado na transação", async () => {
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", { nome: "Tecidos" }),
      )
    ).status,
  ).toBe(201)
  expect(db.auditoria.create).toHaveBeenLastCalledWith({
    data: {
      id_empresa: 10,
      id_usuario: 1,
      tabela: "categorias",
      id_registro: 1,
      acao: "INSERT",
      dados_anteriores: null,
      dados_novos: JSON.stringify(row),
    },
  })
  const updated = { ...row, nome: "Aviamentos" }
  db.categorias.update.mockResolvedValue(updated)
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { nome: updated.nome }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.auditoria.create).toHaveBeenLastCalledWith({
    data: {
      id_empresa: 10,
      id_usuario: 1,
      tabela: "categorias",
      id_registro: 1,
      acao: "UPDATE",
      dados_anteriores: JSON.stringify(row),
      dados_novos: JSON.stringify(updated),
    },
  })
})

it("audita a inativação preservando o snapshot anterior", async () => {
  const inactive = { ...row, status: "INATIVA" }
  db.categorias.update.mockResolvedValue(inactive)
  db.produtos.count.mockResolvedValue(2)
  expect(
    (await item.DELETE(await request("/api/categorias/1", "DELETE"), context()))
      .status,
  ).toBe(200)
  expect(db.auditoria.create).toHaveBeenLastCalledWith({
    data: {
      id_empresa: 10,
      id_usuario: 1,
      tabela: "categorias",
      id_registro: 1,
      acao: "UPDATE",
      dados_anteriores: JSON.stringify(row),
      dados_novos: JSON.stringify(inactive),
    },
  })
  expect(db.produtos.delete).not.toHaveBeenCalled()
})

it("falha na auditoria rejeita a mesma transação da criação", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.auditoria.create.mockRejectedValue(new Error("auditoria indisponível"))
  const response = await collection.POST(
    await request("/api/categorias", "POST", { nome: "Tecidos" }),
  )
  expect(response.status).toBe(500)
  await expect(db.$transaction.mock.results.at(-1)?.value).rejects.toThrow(
    "auditoria indisponível",
  )
  expect(db.categorias.create.mock.invocationCallOrder[0]).toBeLessThan(
    db.auditoria.create.mock.invocationCallOrder[0],
  )
})

it("limita rajadas e compartilha o contador entre listagem e ID", async () => {
  db.categorias.findMany.mockResolvedValue([])
  db.categorias.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, (_, index) =>
      request("/api/categorias").then(async (req): Promise<Response> =>
        index % 2 ? item.GET(req, context()) : collection.GET(req),
      ),
    ),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    120,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    5,
  )
})
