import { beforeEach, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as pagarCollection from "../../../src/app/api/contas_pagar/route"
import * as pagarItem from "../../../src/app/api/contas_pagar/[id]/route"
import * as receberCollection from "../../../src/app/api/contas_receber/route"
import * as receberItem from "../../../src/app/api/contas_receber/[id]/route"
import * as despesasCollection from "../../../src/app/api/despesas/route"
import * as despesasItem from "../../../src/app/api/despesas/[id]/route"
import {
  input as payableInput,
  row as payable,
  purchase,
} from "../contas_pagar/fixtures"
import {
  input as receivableInput,
  row as receivable,
  sale,
} from "../contas_receber/fixtures"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"

const expenseInput = {
  id_empresa: 10,
  id_categoria: 30,
  descricao: "Energia",
  data_despesa: "2026-10-24",
  valor: 100,
}
const expense = {
  id: 1,
  ...expenseInput,
  valor: new Prisma.Decimal(100),
  data_despesa: new Date("2026-10-24T00:00:00Z"),
  situacao: "ABERTA",
  id_conta_pagar: null,
  observacao: null,
  data_cadastro: new Date(),
  data_atualizacao: new Date(),
}
const modules = [
  {
    name: "contas_pagar",
    collection: pagarCollection,
    item: pagarItem,
    input: payableInput,
    row: payable,
    cancelled: "CANCELADO",
  },
  {
    name: "contas_receber",
    collection: receberCollection,
    item: receberItem,
    input: receivableInput,
    row: receivable,
    cancelled: "CANCELADO",
  },
  {
    name: "despesas",
    collection: despesasCollection,
    item: despesasItem,
    input: expenseInput,
    row: expense,
    cancelled: "CANCELADA",
  },
] as const

function permissions(editCompanies = [10], deleteCompanies: number[] = []) {
  db.usuario_empresa.findMany.mockImplementation(async ({ where }) => {
    const deleting = where.OR?.some(
      (condition: {
        permissoes_usuario?: { some: { pode_excluir?: boolean } }
      }) => condition.permissoes_usuario?.some.pode_excluir === true,
    )
    return (deleting ? deleteCompanies : editCompanies).map((id_empresa) => ({
      id_empresa,
    }))
  })
}
async function req(path: string, method: string, data?: unknown) {
  const value = await request(path, method, data)
  value.headers.set("Authorization", "Bearer finance-token")
  return value
}
beforeEach(() => {
  resetRateLimitsForTests()
  permissions()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.compras.findFirst.mockResolvedValue(purchase)
  db.venda.findFirst.mockResolvedValue(sale)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_pagar.count.mockResolvedValue(0)
  db.pagamentos_receber.count.mockResolvedValue(0)
  db.despesas.count.mockResolvedValue(0)
  db.movimentacoes_financeiras.count.mockResolvedValue(0)
  for (const financialModule of modules) {
    db[financialModule.name].findFirst.mockResolvedValue(financialModule.row)
    db[financialModule.name].update.mockImplementation(async ({ data }) => ({
      ...financialModule.row,
      ...data,
    }))
    db[financialModule.name].create.mockImplementation(async ({ data }) => ({
      ...financialModule.row,
      ...data,
    }))
  }
})

for (const financialModule of modules) {
  it.each(["PUT", "PATCH"] as const)(
    `${financialModule.name}: %s não cancela com apenas pode_editar`,
    async (method) => {
      const data = {
        ...(method === "PUT" ? financialModule.input : {}),
        situacao: financialModule.cancelled,
      }
      const response = await financialModule.item[method](
        await req(`/api/${financialModule.name}/1`, method, data),
        context(),
      )
      expect(response.status).toBe(403)
      expect((await response.json()).error).toBe(
        "Sem permissão para cancelar nesta empresa.",
      )
      expect(db[financialModule.name].update).not.toHaveBeenCalled()
      expect(db.auditoria.create).not.toHaveBeenCalled()
    },
  )

  it(`${financialModule.name}: mantém edição comum e bloqueia DELETE e cadastro cancelado sem pode_excluir`, async () => {
    expect(
      (
        await financialModule.item.PATCH(
          await req(`/api/${financialModule.name}/1`, "PATCH", {
            descricao: "Descrição revisada",
          }),
          context(),
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await financialModule.item.DELETE(
          await req(`/api/${financialModule.name}/1`, "DELETE"),
          context(),
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await financialModule.collection.POST(
          await req(`/api/${financialModule.name}`, "POST", {
            ...financialModule.input,
            situacao: financialModule.cancelled,
          }),
        )
      ).status,
    ).toBe(403)
    expect(db[financialModule.name].create).not.toHaveBeenCalled()
  })

  it.each(["PUT", "PATCH", "DELETE"] as const)(
    `${financialModule.name}: %s cancela com pode_excluir na empresa`,
    async (method) => {
      permissions([10], [10])
      const data =
        method === "DELETE"
          ? undefined
          : {
              ...(method === "PUT" ? financialModule.input : {}),
              situacao: financialModule.cancelled,
            }
      expect(
        (
          await financialModule.item[method](
            await req(`/api/${financialModule.name}/1`, method, data),
            context(),
          )
        ).status,
      ).toBe(200)
      expect(db[financialModule.name].update).toHaveBeenCalledOnce()
      expect(
        JSON.parse(db.auditoria.create.mock.calls[0][0].data.dados_novos)
          .evento_financeiro,
      ).toBe("CANCELAMENTO")
    },
  )

  it.each([[20], [10]])(
    `${financialModule.name}: cancelar e transferir exige exclusão na origem e destino (%s)`,
    async (deleteCompanies) => {
      permissions([10, 20], [deleteCompanies])
      db.$queryRaw.mockResolvedValue([{ id: 10 }, { id: 20 }])
      const response = await financialModule.item.PATCH(
        await req(`/api/${financialModule.name}/1`, "PATCH", {
          id_empresa: 20,
          situacao: financialModule.cancelled,
        }),
        context(),
      )
      expect(response.status).toBe(403)
      expect(db[financialModule.name].update).not.toHaveBeenCalled()
      expect(db.auditoria.create).not.toHaveBeenCalled()
    },
  )
}
