import { beforeEach, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { consultarResultado } from "@/modules/resultado/service"
import { calcularResultado } from "@/modules/resultado/calculo"
import { db } from "../../helpers/prisma"
import { GET } from "@/app/api/financeiro/resultado/route"

const ctx = { idEmpresa: 10, idUsuario: 1 }
const periodo = { de: "2026-11-01", ate: "2026-11-30" }
beforeEach(() => {
  db.contas_receber.findMany.mockResolvedValue([])
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "EMPRESA",
    usuarios: { nivel_acesso: "ADMIN" },
    permissoes_usuario: [],
  })
  db.contas_receber.groupBy.mockResolvedValue([
    { id_categoria: 1, _sum: { valor_final: new Prisma.Decimal("100.10") } },
  ])
  db.contas_pagar.groupBy.mockResolvedValue([
    { id_categoria: 2, _sum: { valor_final: new Prisma.Decimal("30.03") } },
  ])
  db.despesas.groupBy.mockResolvedValue([
    { id_categoria: 3, _sum: { valor: new Prisma.Decimal("20.02") } },
  ])
  db.categoria_financeira.findMany.mockResolvedValue([
    { id: 1, nome: "Vendas" },
    { id: 2, nome: "Insumos" },
    { id: 3, nome: "Aluguel" },
  ])
})
it("desconta créditos de cancelamento parcial na receita da categoria", async () => {
  db.contas_receber.findMany.mockResolvedValue([
    {
      id_categoria: 1,
      valor_final: new Prisma.Decimal("100.10"),
      pedido_credito_receber: [
        { valor: new Prisma.Decimal("10.01") },
        { valor: new Prisma.Decimal("20.02") },
      ],
    },
  ])
  expect(await consultarResultado(periodo, ctx)).toMatchObject({
    receita: "70.07",
    custo: "30.03",
    despesa: "20.02",
    margem: "20.02",
    percentual: "28.6",
    grupos: expect.arrayContaining([
      { tipo: "Receita", categoria: "Vendas", valor: "70.07" },
    ]),
  })
  expect(db.contas_receber.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_empresa: 10,
        situacao: { not: "CANCELADO" },
        data_vencimento: {
          gte: new Date(periodo.de),
          lte: new Date(periodo.ate),
        },
        pedido_credito_receber: { some: { id_empresa: 10 } },
      },
      select: expect.objectContaining({
        pedido_credito_receber: {
          where: { id_empresa: 10 },
          select: { valor: true },
        },
      }),
    }),
  )
})
it.each(["100.11", "-1.00", "0", "NaN"])(
  "rejeita crédito inconsistente: %s",
  async (valor) => {
    db.contas_receber.findMany.mockResolvedValue([
      {
        id_categoria: 1,
        valor_final: new Prisma.Decimal("100.10"),
        pedido_credito_receber: [{ valor: new Prisma.Decimal(valor) }],
      },
    ])
    await expect(consultarResultado(periodo, ctx)).rejects.toThrow()
  },
)
it("apura categorias e margem com precisão decimal", async () => {
  expect(await consultarResultado(periodo, ctx)).toMatchObject({
    receita: "100.10",
    custo: "30.03",
    despesa: "20.02",
    margem: "50.05",
    percentual: "50.0",
    grupos: expect.arrayContaining([
      expect.objectContaining({ tipo: "Despesa", categoria: "Aluguel" }),
    ]),
  })
})
it("isola empresa, exclui cancelados e despesas já representadas em títulos", async () => {
  await consultarResultado(periodo, ctx)
  const where = {
    id_empresa: 10,
    situacao: { not: "CANCELADO" },
    data_vencimento: {
      gte: new Date("2026-11-01"),
      lte: new Date("2026-11-30"),
    },
  }
  expect(db.contas_receber.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ where }),
  )
  expect(db.contas_pagar.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ where }),
  )
  expect(db.despesas.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_empresa: 10,
        situacao: { not: "CANCELADA" },
        id_conta_pagar: null,
        data_despesa: where.data_vencimento,
      },
    }),
  )
})
it("rejeita período invertido e acesso sem permissão", async () => {
  await expect(
    consultarResultado({ de: periodo.ate, ate: periodo.de }, ctx),
  ).rejects.toThrow()
  db.usuario_empresa.findFirst.mockResolvedValue(null)
  await expect(consultarResultado(periodo, ctx)).rejects.toThrow(
    "Sem permissão",
  )
})
it("não divide por zero e preserva prejuízo", () => {
  expect(calcularResultado([])).toMatchObject({
    margem: "0.00",
    percentual: null,
  })
  expect(
    calcularResultado([
      { tipo: "Despesa", categoria: "Aluguel", valor: "10.05" },
    ]),
  ).toMatchObject({ margem: "-10.05", percentual: null })
})

const req = (
  token = "test-token",
  empresa = "10",
  query = "de=2026-11-01&ate=2026-11-30",
) =>
  new Request(`http://localhost/api/financeiro/resultado?${query}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": empresa },
  })

it.each([
  ["invalido", "10", 401],
  ["production-token", "10", 403],
  ["test-token", "20", 403],
] as const)(
  "nega acesso à API: %s / empresa %s",
  async (token, empresa, status) => {
    expect((await GET(req(token, empresa))).status).toBe(status)
    expect(db.contas_receber.groupBy).not.toHaveBeenCalled()
  },
)
it("revalida permissão dentro da transação", async () => {
  db.usuario_empresa.findFirst
    .mockResolvedValueOnce({
      nivel_acesso: "EMPRESA",
      usuarios: { nivel_acesso: "ADMIN" },
      permissoes_usuario: [],
    })
    .mockResolvedValueOnce(null)
  expect((await GET(req())).status).toBe(403)
  expect(db.contas_receber.groupBy).not.toHaveBeenCalled()
})
it("entrega envelope sem cache e permite o perfil financeiro", async () => {
  const res = await GET(req("finance-token"))
  expect(res.status).toBe(200)
  expect(res.headers.get("Cache-Control")).toBe("no-store")
  expect(await res.json()).toMatchObject({
    success: true,
    data: { margem: "50.05" },
  })
})
it.each([
  "de=2026-11-01&de=2026-11-02&ate=2026-11-30",
  "de=2026-02-30&ate=2026-11-30",
  "de=2026-11-30&ate=2026-11-01",
  "de=2026-11-01&ate=2026-11-30&id_empresa=20",
  "de=2026-11-01&ate=2026-11-30&pagina=2",
])("rejeita filtros inválidos: %s", async (query) => {
  expect((await GET(req("test-token", "10", query))).status).toBe(400)
  expect(db.contas_receber.groupBy).not.toHaveBeenCalled()
})
it("retorna zeros sem lançamentos", async () => {
  db.contas_receber.groupBy.mockResolvedValue([])
  db.contas_pagar.groupBy.mockResolvedValue([])
  db.despesas.groupBy.mockResolvedValue([])
  expect(await consultarResultado(periodo, ctx)).toMatchObject({
    receita: "0.00",
    custo: "0.00",
    despesa: "0.00",
    margem: "0.00",
    percentual: null,
    grupos: [],
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  })
})

it("acumula créditos de vários títulos e mantém as categorias independentes", async () => {
  db.contas_receber.groupBy.mockResolvedValue([
    { id_categoria: 1, _sum: { valor_final: new Prisma.Decimal("100.10") } },
    { id_categoria: 4, _sum: { valor_final: new Prisma.Decimal("50.00") } },
  ])
  db.categoria_financeira.findMany.mockResolvedValue([
    { id: 1, nome: "Vendas A" },
    { id: 4, nome: "Vendas B" },
  ])
  db.contas_receber.findMany.mockResolvedValue([
    {
      id_categoria: 1,
      valor_final: new Prisma.Decimal("50.05"),
      pedido_credito_receber: [{ valor: new Prisma.Decimal("10.01") }],
    },
    {
      id_categoria: 1,
      valor_final: new Prisma.Decimal("50.05"),
      pedido_credito_receber: [{ valor: new Prisma.Decimal("20.02") }],
    },
    {
      id_categoria: 4,
      valor_final: new Prisma.Decimal("50.00"),
      pedido_credito_receber: [{ valor: new Prisma.Decimal("50.00") }],
    },
  ])
  const dados = await consultarResultado(periodo, ctx)
  expect(dados.receita).toBe("70.07")
  expect(dados.grupos.filter((g) => g.tipo === "Receita")).toEqual([
    { tipo: "Receita", categoria: "Vendas A", valor: "70.07" },
    { tipo: "Receita", categoria: "Vendas B", valor: "0.00" },
  ])
})
it("não esconde crédito excessivo de um título no total da categoria", async () => {
  db.contas_receber.findMany.mockResolvedValue([
    {
      id_categoria: 1,
      valor_final: new Prisma.Decimal("10.00"),
      pedido_credito_receber: [{ valor: new Prisma.Decimal("10.01") }],
    },
  ])
  const res = await GET(req())
  expect(res.status).toBe(409)
  expect((await res.json()).error).toContain("Créditos excedem")
})
it("preserva margem e percentual negativos quando há prejuízo", () => {
  expect(
    calcularResultado([
      { tipo: "Receita", categoria: "Vendas", valor: "100.10" },
      { tipo: "Custo", categoria: "Insumos", valor: "150.15" },
    ]),
  ).toMatchObject({ margem: "-50.05", percentual: "-50.0" })
})
it.each([true, false])(
  "exige permissão financeira de leitura no vínculo: %s",
  async (podeLer) => {
    db.usuario_empresa.findFirst.mockResolvedValue({
      nivel_acesso: "USUARIO",
      usuarios: { nivel_acesso: "USUARIO" },
      permissoes_usuario: [
        { recurso: "FINANCEIRO", pode_ler: podeLer, pode_editar: false },
      ],
    })
    const resposta = await GET(req("finance-token"))
    expect(resposta.status).toBe(podeLer ? 200 : 403)
    if (!podeLer) expect(db.contas_receber.groupBy).not.toHaveBeenCalled()
  },
)
it("exige seleção explícita quando há mais de uma empresa", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const request = req()
  request.headers.delete("X-Empresa-Id")
  expect((await GET(request)).status).toBe(400)
  expect(db.contas_receber.groupBy).not.toHaveBeenCalled()
})
it("aplica o limite de consultas sem executar o relatório excedente", async () => {
  for (let i = 0; i < 120; i++) expect((await GET(req())).status).toBe(200)
  expect((await GET(req())).status).toBe(429)
  expect(db.contas_receber.groupBy).toHaveBeenCalledTimes(120)
})
