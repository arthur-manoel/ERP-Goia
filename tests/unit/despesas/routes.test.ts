import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/despesas/route"
import * as item from "../../../src/app/api/despesas/[id]/route"
import { db } from "../../helpers/prisma"
import { context, origin, request } from "../../helpers/http"

const row = {
  id: 1,
  id_empresa: 10,
  id_categoria: 20,
  id_conta_pagar: 30,
  descricao: "Energia elétrica",
  data_despesa: new Date("2026-10-21T00:00:00.000Z"),
  valor: new Prisma.Decimal("120.5"),
  situacao: "ABERTA" as const,
  observacao: null,
  data_cadastro: new Date("2026-10-21T00:00:00.000Z"),
  data_atualizacao: new Date("2026-10-21T00:00:00.000Z"),
}

const body = {
  id_empresa: 10,
  id_categoria: 20,
  id_conta_pagar: 30,
  descricao: row.descricao,
  data_despesa: "2026-10-21",
  valor: 120.5,
}

function existingRelations() {
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 20 })
  db.contas_pagar.findFirst.mockResolvedValue({
    id: 30,
    id_empresa: 10,
    situacao: "ABERTO",
  })
}

it("rejeita requisição sem token", async () => {
  const req = await request("/api/despesas")
  req.headers.delete("Authorization")

  const response = await collection.GET(req)

  expect(response.status).toBe(401)
  expect(db.despesas.findMany).not.toHaveBeenCalled()
})

it("cria despesa somente após validar os relacionamentos", async () => {
  existingRelations()
  db.despesas.create.mockResolvedValue(row)

  const response = await collection.POST(
    await request("/api/despesas", "POST", body),
  )

  expect(response.status).toBe(201)
  expect(db.despesas.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ valor: expect.any(Prisma.Decimal) }),
  })
  expect((await response.json()).data.valor).toBe("120.5")
})

it("recusa vínculo com conta a pagar cancelada ou de outra empresa", async () => {
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 20 })
  db.contas_pagar.findFirst.mockResolvedValue(null)

  const response = await collection.POST(
    await request("/api/despesas", "POST", body),
  )

  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain("Conta a pagar inexistente")
  expect(db.despesas.create).not.toHaveBeenCalled()
})

it("filtra e pagina diretamente no Prisma", async () => {
  db.despesas.findMany.mockResolvedValue([row])
  db.despesas.count.mockResolvedValue(21)

  const response = await collection.GET(
    await request(
      "/api/despesas?page=2&limit=20&busca=energia&situacao=ABERTA",
    ),
  )

  expect(response.status).toBe(200)
  expect((await response.json()).data.totalPages).toBe(2)
  expect(db.despesas.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 20, take: 20 }),
  )
  expect(db.despesas.count).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ situacao: "ABERTA" }),
    }),
  )
})

it("PATCH preserva valor e permite remover vínculo opcional", async () => {
  db.despesas.findFirst.mockResolvedValue(row)
  existingRelations()
  db.despesas.update.mockResolvedValue({ ...row, id_conta_pagar: null })

  const response = await item.PATCH(
    await request("/api/despesas/1", "PATCH", { id_conta_pagar: null }),
    context(),
  )

  expect(response.status).toBe(200)
  expect(db.despesas.update).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
    data: expect.objectContaining({
      id_conta_pagar: null,
      valor: expect.any(Prisma.Decimal),
    }),
  })
})

it("protege transição para aberta e mantém histórico no cancelamento", async () => {
  db.despesas.findFirst.mockResolvedValue({ ...row, situacao: "PAGA" })
  const forbidden = await item.PATCH(
    await request("/api/despesas/1", "PATCH", { situacao: "ABERTA" }),
    context(),
  )
  expect(forbidden.status).toBe(409)

  db.despesas.findFirst.mockResolvedValue(row)
  db.despesas.update.mockResolvedValue({ ...row, situacao: "CANCELADA" })
  const canceled = await item.DELETE(
    await request("/api/despesas/1", "DELETE"),
    context(),
  )
  expect(canceled.status).toBe(200)
  expect(db.despesas.update).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
    data: { situacao: "CANCELADA" },
  })
})

it("retorna 400 para campo proibido e oculta erro inesperado", async () => {
  const invalid = await item.PATCH(
    await request("/api/despesas/1", "PATCH", { data_cadastro: "2026-01-01" }),
    context(),
  )
  expect(invalid.status).toBe(400)

  vi.spyOn(console, "error").mockImplementation(() => {})
  db.despesas.findFirst.mockRejectedValue(new Error("interno"))
  const response = await item.GET(
    new Request(origin + "/api/despesas/1", {
      headers: { Authorization: "Bearer test-token" },
    }),
    context(),
  )
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
})
