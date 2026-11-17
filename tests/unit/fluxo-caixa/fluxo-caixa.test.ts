import { beforeEach, expect, it, vi } from "vitest"
import * as jwt from "@/lib/jwt"
import { Prisma } from "@/generated/prisma/client"
import { consultarFluxoCaixa } from "@/modules/fluxo-caixa/service"
import { GET } from "@/app/api/financeiro/fluxo-caixa/route"
import { db } from "../../helpers/prisma"

const d = (v: string | number) => new Prisma.Decimal(v)
const ctx = { idEmpresa: 10, idUsuario: 1 }
const periodo = { de: "2026-11-01", ate: "2026-11-30" }
const agora = new Date("2026-11-12T12:00:00Z")
const consultar = (p: object = periodo) => consultarFluxoCaixa(p, ctx, agora)

beforeEach(() => {
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "EMPRESA",
    usuarios: { nivel_acesso: "ADMIN" },
    permissoes_usuario: [],
  })
  db.contas_bancarias.aggregate.mockResolvedValue({
    _sum: { saldo_inicial: null },
  })
  db.movimentacoes_financeiras.groupBy.mockResolvedValue([])
  db.movimentacoes_financeiras.aggregate.mockResolvedValue({
    _sum: { valor: null },
  })
  db.movimentacoes_financeiras.findMany.mockResolvedValue([])
  db.movimentacoes_financeiras.count.mockResolvedValue(0)
  db.contas_receber.findMany.mockResolvedValue([])
  db.contas_pagar.findMany.mockResolvedValue([])
})

it("retorna zeros sem dados e mantém snapshot consistente", async () => {
  expect(await consultar()).toMatchObject({
    entradas: "0.00",
    saidas: "0.00",
    saldoProjetado: "0.00",
    movimentos: [],
    totalPaginas: 0,
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  })
})

it("separa realizados de pendências, preserva centavos, abate pagamentos e créditos", async () => {
  db.contas_bancarias.aggregate.mockResolvedValue({
    _sum: { saldo_inicial: d("1000.01") },
  })
  db.movimentacoes_financeiras.groupBy.mockResolvedValue([
    { tipo: "ENTRADA", _sum: { valor: d("200.10") } },
    { tipo: "SAIDA", _sum: { valor: d("50.02") } },
  ])
  db.movimentacoes_financeiras.aggregate
    .mockResolvedValueOnce({ _sum: { valor: d("100.10") } })
    .mockResolvedValueOnce({ _sum: { valor: d("20.02") } })
  db.contas_receber.findMany.mockResolvedValue([
    {
      valor_final: d(100),
      data_vencimento: new Date("2026-11-30"),
      pagamentos_receber: [{ valor: d("30.01") }],
      pedido_credito_receber: [
        { valor: d(10), saldo_anulado: d(10), valor_restituir: d(0) },
      ],
    },
  ])
  db.contas_pagar.findMany.mockResolvedValue([
    {
      valor_final: d(50),
      data_vencimento: new Date("2026-10-30"),
      pagamentos_pagar: [{ valor: d("10.02") }],
    },
  ])
  expect(await consultar()).toMatchObject({
    entradas: "100.10",
    saidas: "20.02",
    saldoPeriodo: "80.08",
    saldoDisponivel: "1150.09",
    aReceber: "59.99",
    aPagar: "39.98",
    saldoProjetado: "1170.10",
    atrasados: { quantidade: 1, receber: "0.00", pagar: "39.98" },
  })
})

it("usa saldo real dos pagamentos e considera atrasos fora do período, sem contar vencimento hoje", async () => {
  db.contas_receber.findMany.mockResolvedValue([
    {
      saldo: d(999),
      valor_final: d(100),
      data_vencimento: new Date("2026-10-01"),
      pagamentos_receber: [{ valor: d(40) }],
      pedido_credito_receber: [],
    },
    {
      valor_final: d(20),
      data_vencimento: new Date("2026-11-12"),
      pagamentos_receber: [],
      pedido_credito_receber: [],
    },
    {
      valor_final: d(10),
      data_vencimento: new Date("2026-11-11"),
      pagamentos_receber: [{ valor: d(10) }],
      pedido_credito_receber: [],
    },
  ])
  expect(
    await consultar({ de: "2026-10-01", ate: "2026-10-31" }),
  ).toMatchObject({
    aReceber: "60.00",
    atrasados: { quantidade: 1, receber: "60.00" },
  })
})

it("escopa consultas, inclui o último dia e exclui pagamentos cancelados e títulos encerrados", async () => {
  await consultar()
  expect(db.contas_receber.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_empresa: 10,
        situacao: { notIn: ["PAGO", "CANCELADO"] },
        data_vencimento: { lte: new Date("2026-11-30") },
      },
      select: {
        valor_final: true,
        data_vencimento: true,
        pagamentos_receber: {
          where: { id_empresa: 10, status: "CONFIRMADO" },
          select: { valor: true },
        },
        pedido_credito_receber: {
          where: { id_empresa: 10 },
          select: { valor: true, saldo_anulado: true, valor_restituir: true },
        },
      },
    }),
  )
  expect(db.contas_pagar.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_empresa: 10,
        situacao: { notIn: ["PAGO", "CANCELADO"] },
      }),
      select: {
        valor_final: true,
        data_vencimento: true,
        pagamentos_pagar: {
          where: { id_empresa: 10, status: "CONFIRMADO" },
          select: { valor: true },
        },
      },
    }),
  )
  expect(db.movimentacoes_financeiras.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_empresa: 10,
        data_movimentacao: {
          gte: new Date("2026-11-01T03:00:00Z"),
          lt: new Date("2026-12-01T03:00:00Z"),
        },
      },
    }),
  )
  expect(db.contas_bancarias.aggregate).toHaveBeenCalledWith({
    where: {
      id_empresa: 10,
      data_cadastro: { lt: new Date("2026-12-01T03:00:00Z") },
    },
    _sum: { saldo_inicial: true },
  })
})

it("paginação não limita os totais financeiros", async () => {
  db.movimentacoes_financeiras.count.mockResolvedValue(51)
  expect(await consultar({ ...periodo, pagina: 2 })).toMatchObject({
    pagina: 2,
    totalPaginas: 3,
  })
  expect(db.movimentacoes_financeiras.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 25, take: 25 }),
  )
})

it("retorna a última página existente quando o número solicitado ficou fora da lista", async () => {
  db.movimentacoes_financeiras.count.mockResolvedValue(26)
  const resultado = await consultar({ ...periodo, pagina: 3 })
  expect(resultado).toMatchObject({ pagina: 2, totalPaginas: 2 })
  expect(db.movimentacoes_financeiras.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 25 }),
  )
})

it("normaliza para a primeira página quando não há movimentos", async () => {
  expect(await consultar({ ...periodo, pagina: 99 })).toMatchObject({
    pagina: 1,
    totalPaginas: 0,
  })
})

it.each(["receber", "pagar"])(
  "rejeita pagamento negativo confirmado em conta a %s",
  async (tipo) => {
    const titulo = {
      valor_final: d(100),
      data_vencimento: new Date("2026-11-01"),
      pedido_credito_receber: [],
      pagamentos_receber: [{ valor: d(40) }, { valor: d(-10) }],
      pagamentos_pagar: [{ valor: d(40) }, { valor: d(-10) }],
    }
    if (tipo === "receber")
      db.contas_receber.findMany.mockResolvedValue([titulo])
    else db.contas_pagar.findMany.mockResolvedValue([titulo])
    await expect(consultar()).rejects.toThrow("pagamento")
  },
)

it("exclui da posição bancária os saldos de contas cadastradas após a data final", async () => {
  const contas = [
    { data: new Date("2026-10-01T12:00:00Z"), saldo: d(100) },
    { data: new Date("2026-12-01T02:59:59Z"), saldo: d(50) },
    { data: new Date("2026-12-01T03:00:00Z"), saldo: d(900) },
  ]
  db.contas_bancarias.aggregate.mockImplementation(async ({ where }) => ({
    _sum: {
      saldo_inicial: contas
        .filter((c) => !where.data_cadastro || c.data < where.data_cadastro.lt)
        .reduce((s, c) => s.plus(c.saldo), d(0)),
    },
  }))
  expect(await consultar()).toMatchObject({
    saldoDisponivel: "150.00",
    saldoProjetado: "150.00",
  })
})

it("rejeita histórico com pagamento maior que o título", async () => {
  db.contas_pagar.findMany.mockResolvedValue([
    {
      valor_final: d(10),
      data_vencimento: new Date("2026-11-01"),
      pagamentos_pagar: [{ valor: d(11) }],
    },
  ])
  await expect(consultar()).rejects.toThrow("Pagamento excede")
})

it.each([
  { de: "2026-11-02", ate: "2026-11-01" },
  { de: "2026-02-30", ate: "2026-11-01" },
  { ...periodo, id_empresa: "20" },
  { ...periodo, pagina: 0 },
])(
  "rejeita período ou parâmetros inválidos %j antes de consultar",
  async (p) => {
    await expect(consultar(p)).rejects.toThrow()
    expect(db.$transaction).not.toHaveBeenCalled()
  },
)

const req = (
  token = "test-token",
  empresa = "10",
  query = "de=2026-11-01&ate=2026-11-30",
) =>
  new Request(`http://localhost/api/financeiro/fluxo-caixa?${query}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": empresa },
  })
it.each([
  ["invalido", "10", 401],
  ["production-token", "10", 403],
  ["test-token", "20", 403],
] as const)(
  "nega token/papel/empresa: %s %s",
  async (token, empresa, status) => {
    expect((await GET(req(token, empresa))).status).toBe(status)
    expect(db.movimentacoes_financeiras.findMany).not.toHaveBeenCalled()
  },
)
it("revalida permissão no snapshot da consulta", async () => {
  db.usuario_empresa.findFirst
    .mockResolvedValueOnce({
      nivel_acesso: "EMPRESA",
      usuarios: { nivel_acesso: "ADMIN" },
      permissoes_usuario: [],
    })
    .mockResolvedValueOnce(null)
  expect((await GET(req())).status).toBe(403)
  expect(db.movimentacoes_financeiras.findMany).not.toHaveBeenCalled()
})
it("API entrega envelope sem cache e rejeita filtros repetidos", async () => {
  const resposta = await GET(req())
  expect(resposta.status).toBe(200)
  expect(resposta.headers.get("Cache-Control")).toBe("no-store")
  expect(await resposta.json()).toMatchObject({
    success: true,
    data: { entradas: "0.00" },
  })
  expect(
    (
      await GET(
        req("test-token", "10", "de=2026-11-01&de=2026-11-02&ate=2026-11-30"),
      )
    ).status,
  ).toBe(400)
})

it("preserva a mensagem de falha interna da sessão sem confundir com falta de permissão", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(jwt, "verifyAccessToken").mockRejectedValueOnce(
    new Error("Falha interna confidencial"),
  )
  const resposta = await GET(req())
  expect(resposta.status).toBe(500)
  expect(await resposta.json()).toEqual({
    success: false,
    error: "Não foi possível validar a sessão.",
  })
  expect(db.contas_receber.findMany).not.toHaveBeenCalled()
})
