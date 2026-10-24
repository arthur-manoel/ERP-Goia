import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_receber/route"
import * as item from "../../../src/app/api/contas_receber/[id]/route"
import * as repository from "../../../modules/contas_receber/repository"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row, sale } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.venda.findFirst.mockResolvedValue(sale)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.pagamentos_receber.count.mockResolvedValue(0)
})

// Simula exclusão mútua para conferir a ordem da leitura/validação/escrita.
// O teste do SQL abaixo confere o FOR UPDATE; não é um teste com MySQL real.
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

it("dois PATCH recalculam sobre o estado mais recente sem perder desconto ou acréscimo", async () => {
  transactions()
  let stored: repository.ContaReceber = { ...row }
  db.contas_receber.findFirst.mockImplementation(async () => ({ ...stored }))
  db.contas_receber.update.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data }
    return stored
  })
  const responses = await Promise.all([
    item.PATCH(
      await request("/api/contas_receber/1", "PATCH", { valor_desconto: 10 }),
      context(),
    ),
    item.PATCH(
      await request("/api/contas_receber/1", "PATCH", { valor_acrescimo: 8 }),
      context(),
    ),
  ])
  expect(responses.map((response) => response.status)).toEqual([200, 200])
  expect(stored.valor_desconto.toString()).toBe("10")
  expect(stored.valor_acrescimo.toString()).toBe("8")
  expect(stored.valor_final.toString()).toBe("82")
  expect(stored.saldo?.toString()).toBe("82")
  const rawQueries = db.$queryRaw.mock.calls.map(([strings]) =>
    strings.join("?"),
  )
  expect(
    rawQueries.filter(
      (sql) =>
        sql.includes("FROM contas_receber") && sql.includes("FOR UPDATE"),
    ),
  ).toHaveLength(2)
})

it("espera o lock da empresa e revalida se a venda foi fechada antes de criar título manual", async () => {
  transactions()
  let release!: () => void
  let closed = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  db.venda.findFirst.mockImplementation(async () => ({
    ...sale,
    _count: { pedido_cliente_fechamento: closed ? 1 : 0 },
  }))
  // Representa o fechamento existente: ele também adquire o lock de empresas.
  const closing = repository.withWriteLock([10], async () => {
    await gate
    closed = true
  })
  await vi.waitFor(() => expect(db.$queryRaw).toHaveBeenCalledTimes(1))
  const creating = collection.POST(
    await request("/api/contas_receber", "POST", input),
  )
  await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalledTimes(2))
  expect(db.venda.findFirst).not.toHaveBeenCalled()
  release()
  await closing
  expect((await creating).status).toBe(409)
  expect(db.contas_receber.create).not.toHaveBeenCalled()
})

it("mapeia deadlock para 409, sem repetir uma escrita automaticamente", async () => {
  db.$transaction.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("deadlock", {
      code: "P2034",
      clientVersion: "test",
    }),
  )
  const response = await collection.POST(
    await request("/api/contas_receber", "POST", input),
  )
  expect(response.status).toBe(409)
  expect(db.$transaction).toHaveBeenCalledTimes(1)
})

it("aplica também o escopo autorizado no count isolado", async () => {
  db.contas_receber.count.mockResolvedValue(0)
  await repository.count(
    { ordenar_por: "id", ordem: "asc", id_empresa: 99 },
    [10],
  )
  expect(db.contas_receber.count).toHaveBeenCalledWith({
    where: { AND: [{ id_empresa: { in: [10] } }, { id_empresa: 99 }] },
  })
})
