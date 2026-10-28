import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/categorias/route"
import * as item from "../../../src/app/api/categorias/[id]/route"
import * as repository from "../../../modules/categorias/repository"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE") ? [] : [{ id: 10 }],
  )
  db.categorias.findFirst.mockResolvedValue(row)
  db.categorias.create.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.categorias.update.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.produtos.count.mockResolvedValue(0)
})
const operations = [
  ["GET", "pode_ler", (req: Request) => collection.GET(req)],
  ["POST", "pode_criar", (req: Request) => collection.POST(req)],
  ["GET ID", "pode_ler", (req: Request) => item.GET(req, context())],
  ["PUT", "pode_editar", (req: Request) => item.PUT(req, context())],
  ["PATCH", "pode_editar", (req: Request) => item.PATCH(req, context())],
  ["DELETE", "pode_excluir", (req: Request) => item.DELETE(req, context())],
] as const
it.each(operations)(
  "%s exige JWT válido, vínculo e permissão por operação",
  async (_, permission, invoke) => {
    const req = await request("/api/categorias")
    req.headers.delete("Authorization")
    expect((await invoke(req)).status).toBe(401)
    req.headers.set("Authorization", "Bearer invalid-token")
    expect((await invoke(req)).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    req.headers.set("Authorization", "Bearer test-token")
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await invoke(req)).status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ATIVO",
          OR: expect.arrayContaining([
            {
              permissoes_usuario: {
                some: { recurso: "CATEGORIAS", [permission]: true },
              },
            },
          ]),
        }),
      }),
    )
    expect(db.categorias.findFirst).not.toHaveBeenCalled()
  },
)

it("cria categoria na empresa e infere empresa única quando omitida", async () => {
  const response = await collection.POST(
    await request("/api/categorias", "POST", input),
  )
  expect(response.status).toBe(201)
  expect((await response.json()).data).toMatchObject({
    id_empresa: 10,
    nome: "Malha Lisa",
    status: "ATIVA",
  })
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", { nome: "Aviamentos" }),
      )
    ).status,
  ).toBe(201)
  expect(db.categorias.create.mock.lastCall?.[0].data.id_empresa).toBe(10)
})
it("empresa opcional não cria categoria global nem escolhe empresa ambígua", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", { nome: "Tecidos" }),
      )
    ).status,
  ).toBe(400)
  const req = await request("/api/categorias", "POST", { nome: "Tecidos" })
  req.headers.set("X-Empresa-Id", "10")
  expect((await collection.POST(req)).status).toBe(201)
})
it("bloqueia empresa não autorizada no corpo, filtro e header", async () => {
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", { ...input, id_empresa: 99 }),
      )
    ).status,
  ).toBe(403)
  expect(
    (await collection.GET(await request("/api/categorias?id_empresa=99")))
      .status,
  ).toBe(403)
  const req = await request("/api/categorias")
  req.headers.set("X-Empresa-Id", "99")
  expect((await collection.GET(req)).status).toBe(403)
  expect(db.categorias.create).not.toHaveBeenCalled()
})
it("lista com filtro, ordenação, total e paginação executados no banco", async () => {
  db.categorias.findMany.mockResolvedValue([row])
  db.categorias.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/categorias?page=2&limit=10&nome=Malha&busca=Lisa&status=ATIVA&ordenar_por=nome&ordem=desc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    page: 2,
    limit: 10,
    count: 21,
    totalPages: 3,
  })
  const query = db.categorias.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    skip: 10,
    take: 10,
    orderBy: [{ nome: "desc" }, { id: "asc" }],
  })
  expect(query.where.AND).toEqual(
    expect.arrayContaining([
      { id_empresa: { in: [10] } },
      { nome: { contains: "Malha" } },
      { nome: { contains: "Lisa" } },
    ]),
  )
  expect(db.categorias.count).toHaveBeenCalledWith({ where: query.where })
})
it("não permite consulta nem escrita fora do escopo empresarial", async () => {
  db.categorias.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/categorias/1"), context())).status,
  ).toBe(404)
  expect(db.categorias.findFirst).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
  })
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { nome: "Novo" }),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(db.categorias.update).not.toHaveBeenCalled()
})
it("duplicidade ativa normalizada retorna 409 com SQL parametrizado", async () => {
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE")
      ? [{ ...row, id: 2 }]
      : [{ id: 10 }],
  )
  expect(
    (
      await collection.POST(
        await request("/api/categorias", "POST", {
          ...input,
          nome: " malha\t lisa ",
        }),
      )
    ).status,
  ).toBe(409)
  expect(db.categorias.create).not.toHaveBeenCalled()
  const query = db.$queryRaw.mock.calls.find(([sql]) =>
    sql.join("").includes("REGEXP_REPLACE"),
  )!
  expect(query[0].join("")).not.toContain("malha lisa")
  expect(query).toContain("malha lisa")
})
it("ID inexistente retorna 404 antes da checagem de nome duplicado", async () => {
  db.categorias.findFirst.mockResolvedValue(null)
  expect(
    (
      await item.PUT(
        await request("/api/categorias/1", "PUT", input),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(
    db.$queryRaw.mock.calls.some(([sql]) =>
      sql.join("").includes("REGEXP_REPLACE"),
    ),
  ).toBe(false)
})
it("PUT é completo e PATCH não aplica defaults de status nem descrição", async () => {
  expect(
    (
      await item.PUT(
        await request("/api/categorias/1", "PUT", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.categorias.update.mock.calls[0][0].data).toEqual({
    descricao: "Nova",
  })
  expect(
    (
      await item.PUT(
        await request("/api/categorias/1", "PUT", { nome: "Nova categoria" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.categorias.update.mock.lastCall?.[0].data).toMatchObject({
    descricao: null,
    status: "ATIVA",
  })
  expect(db.categorias.update.mock.lastCall?.[0].data).not.toHaveProperty(
    "id_empresa",
  )
})
it("inativa com produtos vinculados e preserva histórico", async () => {
  db.produtos.count.mockResolvedValue(4)
  const response = await item.DELETE(
    await request("/api/categorias/1", "DELETE"),
    context(),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data.produtos_vinculados).toBe(4)
  expect(db.produtos.count).toHaveBeenCalledWith({ where: { id_categoria: 1 } })
  expect(db.categorias.update.mock.calls[0][0].data).toEqual({
    status: "INATIVA",
  })
  expect(db.categorias.delete).not.toHaveBeenCalled()
  expect(db.produtos.update).not.toHaveBeenCalled()
})
it.each(["PUT", "PATCH"] as const)(
  "%s exige pode_excluir para inativar",
  async (method) => {
    db.usuario_empresa.findMany.mockImplementation(async ({ where }) =>
      where.OR.some(
        (condition: {
          permissoes_usuario?: { some: { pode_excluir?: boolean } }
        }) => condition.permissoes_usuario?.some.pode_excluir,
      )
        ? []
        : [{ id_empresa: 10 }],
    )
    expect(
      (
        await item[method](
          await request("/api/categorias/1", method, {
            ...input,
            status: "INATIVA",
          }),
          context(),
        )
      ).status,
    ).toBe(403)
    expect(db.categorias.update).not.toHaveBeenCalled()
  },
)
it("não transfere categoria vinculada e exige empresa ativa", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.$queryRaw.mockResolvedValue([{ id: 10 }, { id: 20 }])
  db.produtos.count.mockResolvedValue(1)
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { id_empresa: 20 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.categorias.update).not.toHaveBeenCalled()
  db.$queryRaw.mockResolvedValue([])
  expect(
    (await collection.POST(await request("/api/categorias", "POST", input)))
      .status,
  ).toBe(400)
})
it("inativação repetida é idempotente e reativação verifica unicidade", async () => {
  db.categorias.findFirst.mockResolvedValue({ ...row, status: "INATIVA" })
  expect(
    (await item.DELETE(await request("/api/categorias/1", "DELETE"), context()))
      .status,
  ).toBe(200)
  expect(db.categorias.update).not.toHaveBeenCalled()
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE")
      ? [{ ...row, id: 2 }]
      : [{ id: 10 }],
  )
  expect(
    (
      await item.PATCH(
        await request("/api/categorias/1", "PATCH", { status: "ATIVA" }),
        context(),
      )
    ).status,
  ).toBe(409)
})
it("traduz conflito de constraint e mantém erro interno genérico", async () => {
  db.categorias.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "test",
    }),
  )
  expect(
    (await collection.POST(await request("/api/categorias", "POST", input)))
      .status,
  ).toBe(409)
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.categorias.findFirst.mockRejectedValue(new Error("segredo"))
  const response = await item.GET(await request("/api/categorias/1"), context())
  expect(response.status).toBe(500)
  expect((await response.json()).error).toBe("Erro interno do servidor.")
})
it("count isolado preserva o escopo da empresa", async () => {
  db.categorias.count.mockResolvedValue(0)
  await repository.count(
    { id_empresa: 99, ordenar_por: "id", ordem: "asc" },
    [10],
  )
  expect(db.categorias.count).toHaveBeenCalledWith({
    where: { AND: [{ id_empresa: { in: [10] } }, { id_empresa: 99 }] },
  })
})
it("rejeita JSON, parâmetros e filtros inválidos antes de gravar", async () => {
  expect(
    (await collection.POST(await request("/api/categorias", "POST"))).status,
  ).toBe(400)
  expect(
    (await item.GET(await request("/api/categorias/0"), context("0"))).status,
  ).toBe(400)
  expect(
    (await collection.GET(await request("/api/categorias?page=1&page=2")))
      .status,
  ).toBe(400)
  expect(db.categorias.create).not.toHaveBeenCalled()
})
it("aplica rate limiting em rajada por usuário autenticado", async () => {
  db.categorias.findMany.mockResolvedValue([])
  db.categorias.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, async () =>
      collection.GET(await request("/api/categorias")),
    ),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    120,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    5,
  )
})
