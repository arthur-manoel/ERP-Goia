import { beforeEach, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_receber/route"
import * as item from "../../../src/app/api/contas_receber/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { input, row, sale } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
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

it.each(["PUT", "PATCH"] as const)(
  "%s preserva R$ 97 ao editar apenas descrição",
  async (method) => {
    const data = {
      ...(method === "PUT" ? input : {}),
      descricao: "Nova descrição",
    }
    const response = await item[method](
      await request("/api/contas_receber/1", method, data),
      context(),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({
      valor_final: "97",
      saldo: "97",
    })
    const written = db.contas_receber.update.mock.calls[0][0].data
    expect(written).not.toHaveProperty("valor_final")
    expect(written.saldo.toString()).toBe("97")
  },
)

it("não reprecifica valor histórico divergente da fórmula em edição de metadados", async () => {
  db.contas_receber.findFirst.mockResolvedValue({
    ...row,
    valor_final: new Prisma.Decimal(93),
    saldo: new Prisma.Decimal(93),
  })
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          observacao: "Conferido",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.contas_receber.update.mock.calls[0][0].data).not.toHaveProperty(
    "valor_final",
  )
  expect(db.contas_receber.update.mock.calls[0][0].data.saldo.toString()).toBe(
    "93",
  )
})

it("soma acréscimo no cadastro e em alterações monetárias, mantendo centavos exatos", async () => {
  expect(
    (await collection.POST(await request("/api/contas_receber", "POST", input)))
      .status,
  ).toBe(201)
  expect(
    db.contas_receber.create.mock.calls[0][0].data.valor_final.toString(),
  ).toBe("97")
  expect(
    (
      await item.PATCH(
        await request("/api/contas_receber/1", "PATCH", {
          valor_acrescimo: "2.25",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  const written = db.contas_receber.update.mock.calls[0][0].data
  expect(written.valor_final.toString()).toBe("97.25")
  expect(written.saldo.toString()).toBe("97.25")
})
