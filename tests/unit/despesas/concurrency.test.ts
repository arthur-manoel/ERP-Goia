import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/despesas/route"
import * as item from "../../../src/app/api/despesas/[id]/route"
import * as account from "../../../src/app/api/contas_pagar/[id]/route"
import * as repository from "../../../modules/despesas/repository"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { row as payable } from "../contas_pagar/fixtures"

const input = {
  id_empresa: 10,
  id_categoria: 30,
  descricao: "Energia",
  data_despesa: "2026-10-24",
  valor: 100,
}
const row: repository.Despesa = {
  id: 1,
  ...input,
  valor: new Prisma.Decimal(100),
  data_despesa: new Date("2026-10-24T00:00:00Z"),
  situacao: "ABERTA",
  id_conta_pagar: null,
  observacao: null,
  data_cadastro: new Date(),
  data_atualizacao: new Date(),
}

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.movimentacoes_financeiras.count.mockResolvedValue(0)
  db.pagamentos_pagar.count.mockResolvedValue(0)
  db.despesas.count.mockResolvedValue(0)
})

// Exclusão mútua simulada para testar a ordem de operações. O SQL dos locks é
// verificado abaixo; este teste não utiliza MySQL real.
function transactions() {
  let tail = Promise.resolve()
  db.$transaction.mockImplementation(async (operation) => {
    const previous = tail
    let unlock!: () => void
    tail = new Promise<void>((resolve) => {
      unlock = resolve
    })
    await previous
    try {
      return await operation(db)
    } finally {
      unlock()
    }
  })
}

it("releitura após lock impede edição financeira depois de cancelamento concorrente", async () => {
  transactions()
  let stored = { ...row }
  db.despesas.findFirst.mockImplementation(async () => ({ ...stored }))
  db.despesas.update.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data }
    return stored
  })
  const responses = await Promise.all([
    item.DELETE(await request("/api/despesas/1", "DELETE"), context()),
    item.PATCH(
      await request("/api/despesas/1", "PATCH", { valor: 200 }),
      context(),
    ),
  ])
  expect(responses.map((response) => response.status)).toEqual([200, 409])
  expect(stored.valor.toString()).toBe("100")
  expect(stored.situacao).toBe("CANCELADA")
  const queries = db.$queryRaw.mock.calls.map(([sql]) => sql.join("?"))
  expect(queries[0]).toContain("FROM empresas")
  expect(queries[1]).toContain("FROM despesas")
  expect(queries.every((sql) => sql.includes("FOR UPDATE"))).toBe(true)
  expect(db.auditoria.create).toHaveBeenCalledTimes(1)
})

it("não vincula despesa a uma conta cancelada por transação concorrente", async () => {
  transactions()
  let stored = { ...payable }
  db.contas_pagar.findFirst.mockImplementation(async () => ({ ...stored }))
  db.contas_pagar.update.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data }
    return stored
  })
  db.despesas.create.mockResolvedValue({ ...row, id_conta_pagar: 1 })
  const responses = await Promise.all([
    account.DELETE(await request("/api/contas_pagar/1", "DELETE"), context()),
    collection.POST(
      await request("/api/despesas", "POST", { ...input, id_conta_pagar: 1 }),
    ),
  ])
  expect(responses.map((response) => response.status)).toEqual([200, 409])
  expect(db.despesas.create).not.toHaveBeenCalled()
  expect(db.contas_pagar.findFirst).toHaveBeenLastCalledWith({
    where: { id: 1, id_empresa: 10 },
  })
})

it("auditoria e escrita usam o TransactionClient, sem fallback para o client global", async () => {
  const tx = {
    ...db,
    despesas: { ...db.despesas, create: vi.fn().mockResolvedValue(row) },
    auditoria: { create: vi.fn().mockResolvedValue({}) },
  }
  db.$transaction.mockImplementation(async (operation) => operation(tx))
  expect(
    (await collection.POST(await request("/api/despesas", "POST", input)))
      .status,
  ).toBe(201)
  expect(tx.despesas.create).toHaveBeenCalledOnce()
  expect(tx.auditoria.create).toHaveBeenCalledOnce()
  expect(db.despesas.create).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
