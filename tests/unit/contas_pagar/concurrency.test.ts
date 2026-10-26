import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as item from "../../../src/app/api/contas_pagar/[id]/route"
import * as repository from "../../../modules/contas_pagar/repository"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { row, purchase } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.compras.findFirst.mockResolvedValue(purchase)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_pagar.count.mockResolvedValue(0)
})

// Mutex simulado para conferir as duas ordens de escrita. O teste confere
// também o SQL de bloqueio; não substitui um teste concorrente no MySQL real.
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

it.each(["desconto primeiro", "acréscimo primeiro"])(
  "regressão: 100 - 10 + 5 termina em 95 com duas edições simultâneas (%s)",
  async (order) => {
    transactions()
    let stored: repository.ContaPagar = {
      ...row,
      valor_desconto: new Prisma.Decimal(0),
      valor_acrescimo: new Prisma.Decimal(0),
      valor_final: new Prisma.Decimal(100),
    }
    db.contas_pagar.findFirst.mockImplementation(async () => ({ ...stored }))
    db.contas_pagar.update.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data }
      return stored
    })
    const discount = { valor_desconto: 10 }
    const increase = { valor_acrescimo: 5 }
    const edits =
      order === "desconto primeiro"
        ? [discount, increase]
        : [increase, discount]
    const responses = await Promise.all(
      edits.map(async (data) =>
        item.PATCH(
          await request("/api/contas_pagar/1", "PATCH", data),
          context(),
        ),
      ),
    )
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(stored.valor_desconto.toFixed(2)).toBe("10.00")
    expect(stored.valor_acrescimo.toFixed(2)).toBe("5.00")
    expect(stored.valor_final.toFixed(2)).toBe("95.00")
    const locks = db.$queryRaw.mock.calls.map(([strings]) => strings.join("?"))
    expect(
      locks.filter(
        (sql) =>
          sql.includes("FROM contas_pagar") && sql.includes("FOR UPDATE"),
      ),
    ).toHaveLength(2)
    expect(db.contas_pagar.findFirst).toHaveBeenCalledTimes(2)
  },
)

it("usa o mesmo TransactionClient para o bloqueio, a releitura e a gravação", async () => {
  const transactionalAccounts = {
    ...db.contas_pagar,
    findFirst: vi.fn().mockResolvedValue(row),
    update: vi.fn().mockResolvedValue(row),
  }
  const transaction = { ...db, contas_pagar: transactionalAccounts }
  db.$transaction.mockImplementation(async (operation) =>
    operation(transaction),
  )
  const response = await item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { valor_desconto: 20 }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.contas_pagar.findFirst).not.toHaveBeenCalled()
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
  expect(
    transactionalAccounts.update.mock.calls[0][0].data.valor_final.toFixed(2),
  ).toBe("85.00")
  const rowLock = db.$queryRaw.mock.calls[1]
  expect(rowLock[0].join("?")).toContain("FOR UPDATE")
  expect(db.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
    transactionalAccounts.findFirst.mock.invocationCallOrder[0],
  )
})

it("uma edição que aguarda cancelamento relê CANCELADO e não sobrescreve a situação", async () => {
  transactions()
  let stored: repository.ContaPagar = { ...row }
  db.contas_pagar.findFirst.mockImplementation(async () => ({ ...stored }))
  db.contas_pagar.update.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data }
    return stored
  })
  const cancelling = item.DELETE(
    await request("/api/contas_pagar/1", "DELETE"),
    context(),
  )
  const editing = item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { valor_original: 110 }),
    context(),
  )
  const [cancelled, edited] = await Promise.all([cancelling, editing])
  expect(cancelled.status).toBe(200)
  expect(edited.status).toBe(409)
  expect(stored.situacao).toBe("CANCELADO")
  expect(stored.valor_final.toFixed(2)).toBe("95.00")
})

it("o count isolado mantém o filtro autorizado mesmo se receber empresa diferente", async () => {
  db.contas_pagar.count.mockResolvedValue(0)
  await repository.count(
    { ordenar_por: "id", ordem: "asc", id_empresa: 99 },
    [10],
  )
  expect(db.contas_pagar.count).toHaveBeenCalledWith({
    where: { AND: [{ id_empresa: { in: [10] } }, { id_empresa: 99 }] },
  })
})
