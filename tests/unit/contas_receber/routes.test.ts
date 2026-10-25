import { afterEach, beforeEach, expect, it, vi } from "vitest"
import * as collection from "../../../src/app/api/contas_receber/route"
import * as item from "../../../src/app/api/contas_receber/[id]/route"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row, sale } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10, status: "ATIVA" })
  db.venda.findFirst.mockResolvedValue(sale)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_receber.count.mockResolvedValue(0)
  db.contas_receber.findFirst.mockResolvedValue(row)
  db.contas_receber.create.mockResolvedValue(row)
  db.contas_receber.update.mockImplementation(async ({ data }) => ({
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
  "%s valida autenticação, papel e permissão por operação",
  async (_, action, invoke) => {
    const req = await request("/api/contas_receber")
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
    expect(db.contas_receber.findFirst).not.toHaveBeenCalled()
  },
)

it("cria calculando original - desconto + acréscimo e inicializando saldo", async () => {
  const response = await collection.POST(
    await request("/api/contas_receber", "POST", input),
  )
  expect(response.status).toBe(201)
  const data = db.contas_receber.create.mock.calls[0][0].data
  expect(data.valor_final.toString()).toBe("97")
  expect(data.saldo.toString()).toBe("97")
  expect(data).toMatchObject({
    numero_parcela: 1,
    total_parcelas: 1,
    situacao: "ABERTO",
  })
  expect(data).not.toHaveProperty("data_cadastro")
})

it.each(["empresas", "venda", "categoria_financeira"] as const)(
  "retorna 400 sem %s válida da mesma empresa",
  async (model) => {
    db[model].findFirst.mockResolvedValue(null)
    const response = await collection.POST(
      await request("/api/contas_receber", "POST", input),
    )
    expect(response.status).toBe(400)
    expect(db.contas_receber.create).not.toHaveBeenCalled()
  },
)

it("valida categoria financeira ativa e de receita dentro da empresa", async () => {
  await collection.POST(await request("/api/contas_receber", "POST", input))
  expect(db.categoria_financeira.findFirst).toHaveBeenCalledWith({
    where: {
      id: 30,
      id_empresa: 10,
      status: "ATIVA",
      tipo: { in: ["RECEITA", "AMBOS"] },
    },
  })
  expect(db.venda.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 20, id_empresa: 10 } }),
  )
})

it("nega dados e seleção de empresa sem autorização", async () => {
  expect(
    (await collection.GET(await request("/api/contas_receber?id_empresa=99")))
      .status,
  ).toBe(403)
  expect(
    (
      await collection.POST(
        await request("/api/contas_receber", "POST", {
          ...input,
          id_empresa: 99,
        }),
      )
    ).status,
  ).toBe(403)
  db.contas_receber.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/contas_receber/1"), context())).status,
  ).toBe(404)
  expect(db.contas_receber.findFirst).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
  })
})

it("respeita X-Empresa-Id e rejeita corpo de outra empresa", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const req = await request("/api/contas_receber", "POST", {
    ...input,
    id_empresa: 20,
  })
  req.headers.set("X-Empresa-Id", "10")
  expect((await collection.POST(req)).status).toBe(403)
  expect(db.contas_receber.create).not.toHaveBeenCalled()
})

it("filtra, ordena e pagina no Prisma, com contagem no mesmo escopo", async () => {
  db.contas_receber.findMany.mockResolvedValue([
    { ...row, situacao: "ATRASADO" },
  ])
  db.contas_receber.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/contas_receber?page=2&limit=10&situacao=VENCIDO&id_venda=20&id_categoria=30&descricao=Venda&busca=uniforme&data_lancamento_fim=2026-10-24&ordenar_por=valor_final&ordem=desc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    page: 2,
    limit: 10,
    count: 21,
    totalPages: 3,
    rows: [{ situacao: "VENCIDO" }],
  })
  const query = db.contas_receber.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    skip: 10,
    take: 10,
    orderBy: [{ valor_final: "desc" }, { id: "asc" }],
  })
  expect(query.where.AND).toEqual(
    expect.arrayContaining([
      { id_empresa: { in: [10] } },
      { situacao: "ATRASADO" },
      { data_lancamento: { lt: new Date("2026-10-25T00:00:00Z") } },
    ]),
  )
  expect(db.contas_receber.count).toHaveBeenCalledWith({ where: query.where })
})

it("PATCH mescla valores atuais com os novos e recalcula o saldo sob lock", async () => {
  const response = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", {
      valor_desconto: "10.00",
    }),
    context(),
  )
  expect(response.status).toBe(200)
  const update = db.contas_receber.update.mock.calls[0][0]
  expect(update.data.valor_final.toString()).toBe("92")
  expect(update.data.saldo.toString()).toBe("92")
  expect(update.data.data_atualizacao).toBeInstanceOf(Date)
  expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
    db.contas_receber.findFirst.mock.invocationCallOrder[0],
  )
  expect(db.contas_receber.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
    db.contas_receber.update.mock.invocationCallOrder[0],
  )
})

it("PUT exige os campos completos e aplica os defaults opcionais", async () => {
  expect(
    (
      await item.PUT(
        await request("/api/contas_receber/1", "PUT", { descricao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(400)
  const response = await item.PUT(
    await request("/api/contas_receber/1", "PUT", input),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.contas_receber.update.mock.calls[0][0].data).toMatchObject({
    descricao: null,
    observacao: null,
    numero_parcela: 1,
    total_parcelas: 1,
  })
})

it("rejeita saldo negativo e parcelas incompatíveis no PATCH mesclado", async () => {
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          valor_desconto: 103,
        }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", { numero_parcela: 2 }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(db.contas_receber.update).not.toHaveBeenCalled()
})

it.each(["PAGO", "PARCIAL"])(
  "não cria nem baixa um título por simples situação %s",
  async (situacao) => {
    expect(
      (
        await collection.POST(
          await request("/api/contas_receber", "POST", { ...input, situacao }),
        )
      ).status,
    ).toBe(409)
    for (const invoke of [item.PATCH, item.PUT]) {
      expect(
        (
          await invoke(
            await request("/api/contas_receber/1", "PATCH", {
              ...input,
              situacao,
            }),
            context(),
          )
        ).status,
      ).toBe(409)
    }
    expect(db.contas_receber.create).not.toHaveBeenCalled()
    expect(db.contas_receber.update).not.toHaveBeenCalled()
  },
)

it.each([
  "id_empresa",
  "id_venda",
  "id_categoria",
  "valor_original",
  "valor_desconto",
  "valor_acrescimo",
  "data_vencimento",
  "numero_parcela",
  "total_parcelas",
  "situacao",
])("protege %s de recebível de pedido fechado", async (key) => {
  db.contas_receber.findFirst.mockResolvedValue({ ...row, id_fechamento: 40 })
  const values: Record<string, unknown> = {
    id_empresa: 10,
    id_venda: 21,
    id_categoria: 31,
    valor_original: 110,
    valor_desconto: 10,
    valor_acrescimo: 3,
    data_vencimento: "2026-12-10",
    numero_parcela: 2,
    total_parcelas: 2,
    situacao: "CANCELADO",
  }
  // id_empresa deve mudar efetivamente para disparar a proteção financeira.
  if (key === "id_empresa") {
    db.usuario_empresa.findMany.mockResolvedValue([
      { id_empresa: 10 },
      { id_empresa: 20 },
    ])
    db.$queryRaw.mockResolvedValue([{ id: 10 }, { id: 20 }])
    values.id_empresa = 20
  }
  const data =
    key === "numero_parcela"
      ? { numero_parcela: 2, total_parcelas: 2 }
      : { [key]: values[key] }
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", data),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_receber.update).not.toHaveBeenCalled()
})

it("permite apenas metadados de título fechado e não recalcula valores do plano", async () => {
  db.contas_receber.findFirst.mockResolvedValue({ ...row, id_fechamento: 40 })
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          descricao: "Referência",
          observacao: "Conferido",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  const data = db.contas_receber.update.mock.calls[0][0].data
  expect(data).toMatchObject({
    descricao: "Referência",
    observacao: "Conferido",
  })
  expect(data).not.toHaveProperty("valor_final")
  expect(data.saldo.toString()).toBe("97")
  expect(
    (
      await item.DELETE(
        await request("/api/contas_receber/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(409)
})

it("bloqueia título manual adicional e transferência para venda com fechamento", async () => {
  db.venda.findFirst.mockResolvedValue({
    ...sale,
    _count: { pedido_cliente_fechamento: 1 },
  })
  expect(
    (await collection.POST(await request("/api/contas_receber", "POST", input)))
      .status,
  ).toBe(409)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", { id_venda: 21 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_receber.create).not.toHaveBeenCalled()
  expect(db.contas_receber.update).not.toHaveBeenCalled()
})

it("não cancela ou reabre conta paga, parcial, cancelada ou com pagamentos", async () => {
  for (const situacao of ["PAGO", "PARCIAL", "CANCELADO"]) {
    db.contas_receber.findFirst.mockResolvedValue({ ...row, situacao })
    expect(
      (
        await item.PATCH(
          await request("/api/contas_receber/1", "PATCH", {
            valor_original: 110,
          }),
          context(),
        )
      ).status,
    ).toBe(409)
    if (situacao !== "CANCELADO")
      expect(
        (
          await item.DELETE(
            await request("/api/contas_receber/1", "DELETE"),
            context(),
          )
        ).status,
      ).toBe(409)
  }
  db.contas_receber.findFirst.mockResolvedValue(row)
  db.pagamentos_receber.count.mockResolvedValue(1)
  expect(
    (
      await item.DELETE(
        await request("/api/contas_receber/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.contas_receber.update).not.toHaveBeenCalled()
})

it("DELETE cancela logicamente um título manual sem pagamentos", async () => {
  const response = await item.DELETE(
    await request("/api/contas_receber/1", "DELETE"),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.contas_receber.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        situacao: "CANCELADO",
        data_atualizacao: expect.any(Date),
      }),
    }),
  )
  expect(db.contas_receber.delete).not.toHaveBeenCalled()
})

it("reconcilia saldo legado divergente com os pagamentos confirmados", async () => {
  db.contas_receber.findFirst.mockResolvedValue({
    ...row,
    saldo: row.valor_final.minus(1),
  })
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          observacao: "Conferir saldo",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_receber.update.mock.calls[0][0].data.saldo.toString()).toBe(
    "97",
  )
  db.contas_receber.update.mockClear()
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          valor_original: 110,
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await item.DELETE(
        await request("/api/contas_receber/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_receber.update.mock.calls[0][0].data.saldo.toString()).toBe(
    "107",
  )
})

it("trata JSON inválido e falhas inesperadas sem vazar dados", async () => {
  const malformed = await request("/api/contas_receber", "POST")
  expect((await collection.POST(malformed)).status).toBe(400)
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.contas_receber.findFirst.mockRejectedValue(new Error("segredo"))
  const response = await item.GET(
    await request("/api/contas_receber/1"),
    context(),
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})

it("rate limit usa usuário validado e não permite trocar IP ou capitalização para contornar", async () => {
  db.contas_receber.findMany.mockResolvedValue([])
  db.contas_receber.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, async (_, index) => {
      const req = await request("/api/contas_receber")
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
