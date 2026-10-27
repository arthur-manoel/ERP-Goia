import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_pagar/route"
import * as item from "../../../src/app/api/contas_pagar/[id]/route"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row, purchase } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10, status: "ATIVA" })
  db.compras.findFirst.mockResolvedValue(purchase)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_pagar.count.mockResolvedValue(0)
  db.despesas.count.mockResolvedValue(0)
  db.contas_pagar.findFirst.mockResolvedValue(row)
  db.contas_pagar.create.mockResolvedValue(row)
  db.contas_pagar.update.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
})
afterEach(() => resetRateLimitsForTests())

const operations = [
  ["GET", "pode_ler", (req: Request) => collection.GET(req)],
  ["POST", "pode_criar", (req: Request) => collection.POST(req)],
  ["GET ID", "pode_ler", (req: Request) => item.GET(req, context())],
  ["PUT", "pode_editar", (req: Request) => item.PUT(req, context())],
  ["PATCH", "pode_editar", (req: Request) => item.PATCH(req, context())],
  ["DELETE", "pode_excluir", (req: Request) => item.DELETE(req, context())],
] as const
it.each(operations)(
  "%s exige token, papel e permissão financeira da operação",
  async (_, action, invoke) => {
    const req = await request("/api/contas_pagar")
    req.headers.delete("Authorization")
    expect((await invoke(req)).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    req.headers.set("Authorization", "Bearer production-token")
    expect((await invoke(req)).status).toBe(403)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    req.headers.set("Authorization", "Bearer finance-token")
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await invoke(req)).status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              permissoes_usuario: {
                some: { recurso: "FINANCEIRO", [action]: true },
              },
            },
          ]),
        }),
      }),
    )
    expect(db.contas_pagar.findFirst).not.toHaveBeenCalled()
  },
)

it("cria calculando 100 - 10 + 5 = 95, sem aceitar valor final do cliente", async () => {
  const response = await collection.POST(
    await request("/api/contas_pagar", "POST", input),
  )
  expect(response.status).toBe(201)
  const data = db.contas_pagar.create.mock.calls[0][0].data
  expect(data.valor_final.toFixed(2)).toBe("95.00")
  expect(data).toMatchObject({
    numero_parcela: 1,
    total_parcelas: 1,
    situacao: "ABERTO",
  })
  expect(data).not.toHaveProperty("data_cadastro")
  const invalid = await collection.POST(
    await request("/api/contas_pagar", "POST", { ...input, valor_final: 1 }),
  )
  expect(invalid.status).toBe(400)
})

it("calcula centavos com Decimal sem perda de precisão", async () => {
  const response = await collection.POST(
    await request("/api/contas_pagar", "POST", {
      ...input,
      valor_original: "0.10",
      valor_desconto: "0.03",
      valor_acrescimo: "0.02",
    }),
  )
  expect(response.status).toBe(201)
  expect(
    db.contas_pagar.create.mock.calls[0][0].data.valor_final.toFixed(2),
  ).toBe("0.09")
})

it.each(["empresas", "compras", "categoria_financeira"] as const)(
  "retorna 400 se %s não existir na empresa",
  async (model) => {
    db[model].findFirst.mockResolvedValue(null)
    expect(
      (await collection.POST(await request("/api/contas_pagar", "POST", input)))
        .status,
    ).toBe(400)
    expect(db.contas_pagar.create).not.toHaveBeenCalled()
  },
)

it("restringe compra e categoria financeira de despesa à mesma empresa", async () => {
  await collection.POST(await request("/api/contas_pagar", "POST", input))
  expect(db.compras.findFirst).toHaveBeenCalledWith({
    where: { id: 20, id_empresa: 10 },
  })
  expect(db.categoria_financeira.findFirst).toHaveBeenCalledWith({
    where: {
      id: 30,
      id_empresa: 10,
      status: "ATIVA",
      tipo: { in: ["DESPESA", "AMBOS"] },
    },
  })
})

it("não cria obrigação para compra cancelada", async () => {
  db.compras.findFirst.mockResolvedValue({ ...purchase, status: "CANCELADA" })
  expect(
    (await collection.POST(await request("/api/contas_pagar", "POST", input)))
      .status,
  ).toBe(409)
  expect(db.contas_pagar.create).not.toHaveBeenCalled()
})

it("nega leitura, criação e edição em empresa sem autorização", async () => {
  expect(
    (await collection.GET(await request("/api/contas_pagar?id_empresa=99")))
      .status,
  ).toBe(403)
  expect(
    (
      await collection.POST(
        await request("/api/contas_pagar", "POST", {
          ...input,
          id_empresa: 99,
        }),
      )
    ).status,
  ).toBe(403)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { id_empresa: 99 }),
        context(),
      )
    ).status,
  ).toBe(403)
  db.contas_pagar.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/contas_pagar/1"), context())).status,
  ).toBe(404)
  expect(db.contas_pagar.findFirst).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
  })
})

it("X-Empresa-Id limita a operação mesmo se o usuário tem vários vínculos", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const req = await request("/api/contas_pagar", "POST", {
    ...input,
    id_empresa: 20,
  })
  req.headers.set("X-Empresa-Id", "10")
  expect((await collection.POST(req)).status).toBe(403)
  expect(db.contas_pagar.create).not.toHaveBeenCalled()
})

it("filtra e pagina no banco com ordenação estável e contagem idêntica", async () => {
  db.contas_pagar.findMany.mockResolvedValue([{ ...row, situacao: "ATRASADO" }])
  db.contas_pagar.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/contas_pagar?page=2&limit=10&situacao=VENCIDO&id_compra=20&id_categoria=30&busca=tecido&data_vencimento_inicio=2026-11-01&data_vencimento_fim=2026-11-30&data_lancamento_fim=2026-10-24&ordenar_por=valor_final&ordem=desc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    count: 21,
    totalPages: 3,
    page: 2,
    limit: 10,
    rows: [{ situacao: "VENCIDO" }],
  })
  const query = db.contas_pagar.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    take: 10,
    skip: 10,
    orderBy: [{ valor_final: "desc" }, { id: "asc" }],
  })
  expect(query.where.AND).toEqual(
    expect.arrayContaining([
      { id_empresa: { in: [10] } },
      { situacao: "ATRASADO" },
      {
        data_vencimento: {
          gte: new Date("2026-11-01T00:00:00Z"),
          lte: new Date("2026-11-30T00:00:00Z"),
        },
      },
      { data_lancamento: { lt: new Date("2026-10-25T00:00:00Z") } },
    ]),
  )
  expect(db.contas_pagar.count).toHaveBeenCalledWith({ where: query.where })
})

it("PATCH relê a conta bloqueada, mescla campos, recalcula e atualiza auditoria", async () => {
  const response = await item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { valor_desconto: 20 }),
    context(),
  )
  expect(response.status).toBe(200)
  const data = db.contas_pagar.update.mock.calls[0][0].data
  expect(data.valor_final.toFixed(2)).toBe("85.00")
  expect(data.data_atualizacao).toBeInstanceOf(Date)
  expect(data).not.toHaveProperty("valor_acrescimo")
  expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
    db.contas_pagar.findFirst.mock.invocationCallOrder[0],
  )
  expect(db.contas_pagar.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
    db.contas_pagar.update.mock.invocationCallOrder[0],
  )
})

it("PUT exige campos completos; PATCH não apaga opcionais omitidos", async () => {
  expect(
    (
      await item.PUT(
        await request("/api/contas_pagar/1", "PUT", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_pagar.update.mock.calls[0][0].data).not.toHaveProperty(
    "observacao",
  )
  expect(
    (
      await item.PUT(
        await request("/api/contas_pagar/1", "PUT", input),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_pagar.update.mock.lastCall?.[0].data).toMatchObject({
    descricao: null,
    observacao: null,
    total_parcelas: 1,
  })
})

it("valida resultado negativo, overflow e parcelas após mesclar PATCH", async () => {
  for (const data of [
    { valor_desconto: 200 },
    { valor_original: "9999999999999.99", valor_acrescimo: 11 },
    { numero_parcela: 2 },
  ]) {
    expect(
      (
        await item.PATCH(
          await request("/api/contas_pagar/1", "PATCH", data),
          context(),
        )
      ).status,
    ).toBe(400)
  }
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
})

it.each(["PAGO", "PARCIAL"])(
  "bloqueia baixa direta para %s sem pagamento e movimentação",
  async (situacao) => {
    expect(
      (
        await collection.POST(
          await request("/api/contas_pagar", "POST", { ...input, situacao }),
        )
      ).status,
    ).toBe(409)
    for (const invoke of [item.PUT, item.PATCH])
      expect(
        (
          await invoke(
            await request("/api/contas_pagar/1", "PATCH", {
              ...input,
              situacao,
            }),
            context(),
          )
        ).status,
      ).toBe(409)
    expect(db.contas_pagar.create).not.toHaveBeenCalled()
    expect(db.contas_pagar.update).not.toHaveBeenCalled()
  },
)

it.each(["PAGO", "PARCIAL", "CANCELADO"])(
  "não reabre nem altera valores de conta %s",
  async (situacao) => {
    db.contas_pagar.findFirst.mockResolvedValue({ ...row, situacao })
    expect(
      (
        await item.PATCH(
          await request("/api/contas_pagar/1", "PATCH", {
            situacao: "ABERTO",
            valor_original: 110,
          }),
          context(),
        )
      ).status,
    ).toBe(409)
    expect(db.contas_pagar.update).not.toHaveBeenCalled()
  },
)

it("preserva auditoria de títulos pagos e com pagamentos, permitindo apenas metadados", async () => {
  db.pagamentos_pagar.count.mockResolvedValue(1)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", {
          observacao: "Conferido",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_pagar.update.mock.calls[0][0].data).not.toHaveProperty(
    "valor_final",
  )
  db.contas_pagar.update.mockClear()
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { valor_original: 110 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await item.DELETE(
        await request("/api/contas_pagar/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
})

it("não transfere conta com despesas históricas para outra empresa", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.$queryRaw.mockResolvedValue([{ id: 10 }, { id: 20 }])
  db.despesas.count.mockResolvedValue(1)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { id_empresa: 20 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
})

it("cancela logicamente, é idempotente e bloqueia cancelamento de conta paga", async () => {
  expect(
    (
      await item.DELETE(
        await request("/api/contas_pagar/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_pagar.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { situacao: "CANCELADO", data_atualizacao: expect.any(Date) },
    }),
  )
  db.contas_pagar.update.mockClear()
  db.contas_pagar.findFirst.mockResolvedValue({ ...row, situacao: "CANCELADO" })
  expect(
    (
      await item.DELETE(
        await request("/api/contas_pagar/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
  db.contas_pagar.findFirst.mockResolvedValue({ ...row, situacao: "PAGO" })
  expect(
    (
      await item.DELETE(
        await request("/api/contas_pagar/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_pagar.delete).not.toHaveBeenCalled()
})

it("retorna 404 para edições sem conta no escopo e 500 sem vazar erro interno", async () => {
  db.contas_pagar.findFirst.mockResolvedValue(null)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { observacao: "Teste" }),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.contas_pagar.findFirst.mockRejectedValue(new Error("segredo"))
  const response = await item.GET(
    await request("/api/contas_pagar/1"),
    context(),
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})

it.each([
  ["P2003", 400],
  ["P2002", 409],
  ["P2034", 409],
] as const)("converte Prisma %s em HTTP %s", async (code, status) => {
  db.contas_pagar.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("falha", {
      code,
      clientVersion: "test",
    }),
  )
  expect(
    (await collection.POST(await request("/api/contas_pagar", "POST", input)))
      .status,
  ).toBe(status)
})

it("aplica 120 leituras por usuário validado apesar de variações de IP e Bearer", async () => {
  db.contas_pagar.findMany.mockResolvedValue([])
  db.contas_pagar.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, async (_, index) => {
      const req = await request("/api/contas_pagar")
      req.headers.set(
        "Authorization",
        `${index % 2 ? "bearer" : "Bearer"} test-token`,
      )
      req.headers.set("X-Forwarded-For", `198.51.100.${index}`)
      return collection.GET(req)
    }),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    120,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    5,
  )
})
