import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_pagar/route"
import * as item from "../../../src/app/api/contas_pagar/[id]/route"
import { db } from "../../helpers/prisma"
import { context, origin, request } from "../../helpers/http"

const row = {
  id: 1,
  id_empresa: 10,
  id_compra: 20,
  id_categoria: 30,
  numero_parcela: 1,
  total_parcelas: 1,
  descricao: "Energia",
  data_lancamento: new Date("2026-10-01T00:00:00.000Z"),
  data_vencimento: new Date("2026-11-10T00:00:00.000Z"),
  valor_original: new Prisma.Decimal(100),
  valor_desconto: new Prisma.Decimal(5),
  valor_acrescimo: new Prisma.Decimal(2),
  valor_final: new Prisma.Decimal(97),
  situacao: "ABERTO" as const,
  observacao: null,
  data_cadastro: new Date("2026-10-01T00:00:00.000Z"),
  data_atualizacao: new Date("2026-10-01T00:00:00.000Z"),
}

function existingRelations() {
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.compras.findFirst.mockResolvedValue({ id: 20, id_empresa: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({
    id: 30,
    id_empresa: 10,
  })
}

const createBody = {
  id_empresa: 10,
  id_compra: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: 100,
  valor_desconto: 5,
  valor_acrescimo: 2,
}

it("rejeita acesso sem token antes de consultar dados", async () => {
  const req = await request("/api/contas_pagar")
  req.headers.delete("Authorization")

  const response = await collection.GET(req)

  expect(response.status).toBe(401)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  expect(db.contas_pagar.findMany).not.toHaveBeenCalled()
})

it("cria a conta com valor final calculado e relações válidas", async () => {
  existingRelations()
  db.contas_pagar.create.mockResolvedValue(row)

  const response = await collection.POST(
    await request("/api/contas_pagar", "POST", createBody),
  )

  expect(response.status).toBe(201)
  const data = (await response.json()).data
  expect(data.valor_final).toBe("97")
  const createCall = db.contas_pagar.create.mock.calls[0][0].data
  expect(createCall.valor_final.toString()).toBe("97")
  expect(createCall.numero_parcela).toBe(1)
})

it("valida empresa, compra e categoria antes de gravar", async () => {
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.compras.findFirst.mockResolvedValue(null)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })

  const response = await collection.POST(
    await request("/api/contas_pagar", "POST", createBody),
  )

  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain("Compra inexistente")
  expect(db.contas_pagar.create).not.toHaveBeenCalled()
})

it("pagina e filtra no banco", async () => {
  db.contas_pagar.findMany.mockResolvedValue([row])
  db.contas_pagar.count.mockResolvedValue(21)

  const response = await collection.GET(
    await request(
      "/api/contas_pagar?page=2&limit=20&situacao=VENCIDO&busca=energia",
    ),
  )

  expect(response.status).toBe(200)
  expect((await response.json()).data.totalPages).toBe(2)
  expect(db.contas_pagar.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 20, take: 20 }),
  )
  expect(db.contas_pagar.count).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ situacao: "ATRASADO" }),
    }),
  )
})

it("PATCH recalcula o valor final e bloqueia retorno de conta paga", async () => {
  db.contas_pagar.findFirst.mockResolvedValue(row)
  existingRelations()
  db.contas_pagar.update.mockResolvedValue({
    ...row,
    valor_final: new Prisma.Decimal(92),
  })

  const patched = await item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { valor_desconto: 10 }),
    context(),
  )
  expect(patched.status).toBe(200)
  expect(
    db.contas_pagar.update.mock.calls[0][0].data.valor_final.toString(),
  ).toBe("92")

  db.contas_pagar.findFirst.mockResolvedValue({ ...row, situacao: "PAGO" })
  const forbidden = await item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { situacao: "ABERTO" }),
    context(),
  )
  expect(forbidden.status).toBe(409)
})

it("cancela logicamente sem apagar o histórico", async () => {
  db.contas_pagar.findFirst.mockResolvedValue(row)
  db.contas_pagar.update.mockResolvedValue({ ...row, situacao: "CANCELADO" })

  const response = await item.DELETE(
    await request("/api/contas_pagar/1", "DELETE"),
    context(),
  )

  expect(response.status).toBe(200)
  expect(db.contas_pagar.update).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: { in: [10] } },
    data: { situacao: "CANCELADO" },
  })
})

it("rejeita campos imutáveis e oculta falhas inesperadas", async () => {
  const invalid = await item.PATCH(
    await request("/api/contas_pagar/1", "PATCH", { valor_final: 1 }),
    context(),
  )
  expect(invalid.status).toBe(400)

  vi.spyOn(console, "error").mockImplementation(() => {})
  db.contas_pagar.findFirst.mockRejectedValue(new Error("interno"))
  const response = await item.GET(
    new Request(origin + "/api/contas_pagar/1", {
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
