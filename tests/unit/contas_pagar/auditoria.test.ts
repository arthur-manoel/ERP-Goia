import { beforeEach, expect, it, vi } from "vitest"
import * as collection from "../../../src/app/api/contas_pagar/route"
import * as item from "../../../src/app/api/contas_pagar/[id]/route"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input, row, purchase } from "./fixtures"

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
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

it("audita criação, edição e cancelamento com snapshots e identidade do JWT", async () => {
  const create = await request("/api/contas_pagar", "POST", input)
  create.headers.set("Authorization", "Bearer finance-token")
  expect((await collection.POST(create)).status).toBe(201)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", {
          descricao: "Revisada",
        }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await item.DELETE(
        await request("/api/contas_pagar/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(200)
  const audits = db.auditoria.create.mock.calls.map(([query]) => query.data)
  expect(audits[0]).toMatchObject({
    id_usuario: 2,
    id_empresa: 10,
    tabela: "contas_pagar",
    acao: "INSERT",
    dados_anteriores: null,
  })
  expect(audits.slice(1).every((audit) => audit.acao === "UPDATE")).toBe(true)
  expect(
    audits.map((audit) => JSON.parse(audit.dados_novos).evento_financeiro),
  ).toEqual(["CRIACAO", "EDICAO", "CANCELAMENTO"])
  expect(JSON.parse(audits[1].dados_anteriores).descricao).toBe(row.descricao)
  expect(JSON.parse(audits[1].dados_novos).descricao).toBe("Revisada")
  expect(db.contas_pagar.delete).not.toHaveBeenCalled()
})

it("falha na auditoria aborta a transação da criação", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.auditoria.create.mockRejectedValue(new Error("Auditoria indisponível"))
  expect(
    (await collection.POST(await request("/api/contas_pagar", "POST", input)))
      .status,
  ).toBe(500)
  await expect(db.$transaction.mock.results[0].value).rejects.toThrow(
    "Auditoria indisponível",
  )
})

it("impede contornar proteção de despesa paga pela conta a pagar vinculada", async () => {
  db.despesas.count.mockResolvedValue(1)
  expect(
    (
      await item.PATCH(
        await request("/api/contas_pagar/1", "PATCH", { valor_original: 200 }),
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
  expect(db.despesas.count).toHaveBeenCalledWith({
    where: { id_conta_pagar: 1, situacao: "PAGA" },
  })
  expect(db.contas_pagar.update).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
