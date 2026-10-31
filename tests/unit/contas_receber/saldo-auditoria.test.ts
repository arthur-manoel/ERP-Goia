import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_receber/route"
import * as item from "../../../src/app/api/contas_receber/[id]/route"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row, sale } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("invalidos") ? [{ invalidos: 0 }] : [{ id: 10 }],
  )
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.venda.findFirst.mockResolvedValue(sale)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_receber.count.mockResolvedValue(0)
  db.contas_receber.findFirst.mockResolvedValue(row)
  db.contas_receber.create.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.contas_receber.update.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
})

function confirmed(value: number, company = 10) {
  db.pagamentos_receber.count.mockResolvedValue(1)
  db.pagamentos_receber.aggregate.mockResolvedValue({
    _sum: { valor: new Prisma.Decimal(value) },
    _count: { _all: 1 },
    _min: { valor: new Prisma.Decimal(value), id_empresa: company },
    _max: { id_empresa: company },
  })
}
const patch = async (data: unknown) =>
  item.PATCH(await request("/api/contas_receber/1", "PATCH", data), context())

it("inicializa saldo e audita criação com o usuário autenticado", async () => {
  const req = await request("/api/contas_receber", "POST", input)
  req.headers.set("Authorization", "Bearer finance-token")
  expect((await collection.POST(req)).status).toBe(201)
  const audit = db.auditoria.create.mock.calls[0][0].data
  expect(audit).toMatchObject({
    id_usuario: 2,
    id_empresa: 10,
    tabela: "contas_receber",
    acao: "INSERT",
  })
  expect(JSON.parse(audit.dados_novos)).toMatchObject({
    saldo: "97",
    evento_financeiro: "CRIACAO",
  })
})

it("reconcilia saldo nulo sem recebimentos e registra antes/depois", async () => {
  db.contas_receber.findFirst.mockResolvedValue({ ...row, saldo: null })
  expect((await patch({ observacao: "Reconciliado" })).status).toBe(200)
  const data = db.contas_receber.update.mock.calls[0][0].data
  expect(data.saldo.toString()).toBe("97")
  const audit = db.auditoria.create.mock.calls[0][0].data
  expect(JSON.parse(audit.dados_anteriores)).toMatchObject({ saldo: null })
  expect(JSON.parse(audit.dados_novos)).toMatchObject({
    saldo: "97",
    evento_financeiro: "RECONCILIACAO",
  })
})

it.each([
  [30, "67", "PARCIAL"],
  [97, "0", "PAGO"],
])(
  "reconcilia recebimento confirmado de %s com movimento existente",
  async (amount, balance, status) => {
    confirmed(Number(amount))
    expect((await patch({ observacao: "Conferido" })).status).toBe(200)
    const data = db.contas_receber.update.mock.calls[0][0].data
    expect(data.saldo.toString()).toBe(balance)
    expect(data.situacao).toBe(status)
    expect(data).not.toHaveProperty("valor_final")
    expect(db.pagamentos_receber.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_conta_receber: 1, status: "CONFIRMADO" },
      }),
    )
    expect(
      JSON.parse(db.auditoria.create.mock.calls[0][0].data.dados_novos)
        .evento_financeiro,
    ).toBe("BAIXA")
    expect(db.pagamentos_receber.create).not.toHaveBeenCalled()
    expect(db.movimentacoes_financeiras.create).not.toHaveBeenCalled()
  },
)

it("bloqueia pagamento sem movimento correspondente", async () => {
  confirmed(30)
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("invalidos") ? [{ invalidos: 1 }] : [{ id: 10 }],
  )
  expect((await patch({ descricao: "Conferido" })).status).toBe(409)
  expect(db.contas_receber.update).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})

it.each([
  [98, 10],
  [-1, 10],
  [30, 99],
])(
  "rejeita pagamentos inconsistentes: valor %s, empresa %s",
  async (amount, company) => {
    confirmed(amount, company)
    expect((await patch({ observacao: "Tentativa" })).status).toBe(409)
    expect(db.contas_receber.update).not.toHaveBeenCalled()
    expect(db.auditoria.create).not.toHaveBeenCalled()
  },
)

it("recalcula saldo junto dos valores e audita cancelamento por PATCH", async () => {
  expect((await patch({ valor_desconto: 10 })).status).toBe(200)
  expect(db.contas_receber.update.mock.calls[0][0].data.saldo.toString()).toBe(
    "92",
  )
  expect((await patch({ situacao: "CANCELADO" })).status).toBe(200)
  expect(
    JSON.parse(db.auditoria.create.mock.calls[1][0].data.dados_novos)
      .evento_financeiro,
  ).toBe("CANCELAMENTO")
})

it("falha de auditoria rejeita a mesma transação da escrita", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.auditoria.create.mockRejectedValue(new Error("Auditoria indisponível"))
  expect((await patch({ descricao: "Nova descrição" })).status).toBe(500)
  await expect(db.$transaction.mock.results[0].value).rejects.toThrow(
    "Auditoria indisponível",
  )
})
