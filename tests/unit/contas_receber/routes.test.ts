import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/contas_receber/route"
import * as item from "../../../src/app/api/contas_receber/[id]/route"
import { db } from "../../helpers/prisma"
import { context, origin, request } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"

const row = {
  id: 1,
  id_empresa: 10,
  id_venda: 20,
  id_categoria: 30,
  numero_parcela: 1,
  total_parcelas: 1,
  descricao: "Venda de uniforme",
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
  db.venda.findFirst.mockResolvedValue({ id: 20, id_empresa: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({
    id: 30,
    id_empresa: 10,
  })
}

const createBody = {
  id_empresa: 10,
  id_venda: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: 100,
  valor_desconto: 5,
  valor_acrescimo: 2,
}

const financialOperations = [
  ["GET lista", "pode_ler", (req: Request) => collection.GET(req)],
  ["POST cria", "pode_criar", (req: Request) => collection.POST(req)],
  ["GET por ID", "pode_ler", (req: Request) => item.GET(req, context())],
  ["PUT", "pode_editar", (req: Request) => item.PUT(req, context())],
  ["PATCH", "pode_editar", (req: Request) => item.PATCH(req, context())],
  ["DELETE", "pode_excluir", (req: Request) => item.DELETE(req, context())],
] as const

async function financeRequest(method: string, body?: unknown) {
  const headers = new Headers({ Authorization: "Bearer finance-token" })
  if (body !== undefined) headers.set("content-type", "application/json")
  return new Request(origin + "/api/contas_receber", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

it("rejeita acesso sem token antes de consultar dados", async () => {
  const req = await request("/api/contas_receber")
  req.headers.delete("Authorization")

  const response = await collection.GET(req)

  expect(response.status).toBe(401)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  expect(db.contas_receber.findMany).not.toHaveBeenCalled()
})

it.each(financialOperations)(
  "%s exige papel financeiro e permissão específica da operação",
  async (_, action, invoke) => {
    const deniedByRole = await invoke(
      new Request(origin + "/api/contas_receber", {
        headers: { Authorization: "Bearer production-token" },
      }),
    )
    expect(deniedByRole.status).toBe(403)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()

    db.usuario_empresa.findMany.mockResolvedValue([])
    const response = await invoke(
      await financeRequest(
        action === "pode_criar"
          ? "POST"
          : action === "pode_editar"
            ? "PATCH"
            : action === "pode_excluir"
              ? "DELETE"
              : "GET",
        action === "pode_criar"
          ? createBody
          : action === "pode_editar"
            ? { descricao: "Ajuste" }
            : undefined,
      ),
    )

    expect(response.status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { usuarios: { nivel_acesso: "ADMIN" } },
            {
              permissoes_usuario: {
                some: { recurso: "FINANCEIRO", [action]: true },
              },
            },
          ],
        }),
      }),
    )
    expect(db.contas_receber.create).not.toHaveBeenCalled()
    expect(db.contas_receber.update).not.toHaveBeenCalled()
  },
)

it("nega filtro explícito de uma empresa sem vínculo", async () => {
  const response = await collection.GET(
    await request("/api/contas_receber?id_empresa=99"),
  )

  expect(response.status).toBe(403)
  expect(db.contas_receber.findMany).not.toHaveBeenCalled()
})

it("cria a conta com valor final calculado e relações válidas", async () => {
  existingRelations()
  db.contas_receber.create.mockResolvedValue(row)

  const response = await collection.POST(
    await request("/api/contas_receber", "POST", createBody),
  )

  expect(response.status).toBe(201)
  expect((await response.json()).data.valor_final).toBe("97")
  const createCall = db.contas_receber.create.mock.calls[0][0].data
  expect(createCall.valor_final.toString()).toBe("97")
  expect(createCall.numero_parcela).toBe(1)
})

it("valida empresa, venda e categoria de receita antes de gravar", async () => {
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.venda.findFirst.mockResolvedValue(null)
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })

  const response = await collection.POST(
    await request("/api/contas_receber", "POST", createBody),
  )

  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain("Venda inexistente")
  expect(db.contas_receber.create).not.toHaveBeenCalled()
})

it("pagina e filtra no banco", async () => {
  db.contas_receber.findMany.mockResolvedValue([row])
  db.contas_receber.count.mockResolvedValue(21)

  const response = await collection.GET(
    await request(
      "/api/contas_receber?page=2&limit=20&situacao=VENCIDO&busca=uniforme",
    ),
  )

  expect(response.status).toBe(200)
  expect((await response.json()).data.totalPages).toBe(2)
  expect(db.contas_receber.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ skip: 20, take: 20 }),
  )
  expect(db.contas_receber.count).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ situacao: "ATRASADO" }),
    }),
  )
})

it("PATCH recalcula o valor final e não altera uma conta paga", async () => {
  db.contas_receber.findFirst.mockResolvedValue(row)
  existingRelations()
  db.contas_receber.update.mockResolvedValue({
    ...row,
    valor_final: new Prisma.Decimal(92),
  })

  const patched = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", { valor_desconto: 10 }),
    context(),
  )
  expect(patched.status).toBe(200)
  expect(
    db.contas_receber.update.mock.calls[0][0].data.valor_final.toString(),
  ).toBe("92")

  db.contas_receber.findFirst.mockResolvedValue({ ...row, situacao: "PAGO" })
  const forbidden = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", { valor_desconto: 10 }),
    context(),
  )
  expect(forbidden.status).toBe(409)
  expect(db.contas_receber.update).toHaveBeenCalledTimes(1)
})

it("cancela logicamente e não cancela uma conta paga", async () => {
  db.contas_receber.findFirst.mockResolvedValue(row)
  db.contas_receber.update.mockResolvedValue({ ...row, situacao: "CANCELADO" })

  const response = await item.DELETE(
    await request("/api/contas_receber/1", "DELETE"),
    context(),
  )

  expect(response.status).toBe(200)
  expect(db.contas_receber.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: 1,
        id_empresa: { in: [10] },
        valor_original: row.valor_original,
        valor_desconto: row.valor_desconto,
        valor_acrescimo: row.valor_acrescimo,
        valor_final: row.valor_final,
        data_atualizacao: row.data_atualizacao,
      }),
      data: { situacao: "CANCELADO" },
    }),
  )

  db.contas_receber.findFirst.mockResolvedValue({ ...row, situacao: "PAGO" })
  const paid = await item.DELETE(
    await request("/api/contas_receber/1", "DELETE"),
    context(),
  )
  expect(paid.status).toBe(409)
  expect(db.contas_receber.update).toHaveBeenCalledTimes(1)
})

it("retorna conflito se o estado mudar entre a leitura e a gravação", async () => {
  db.contas_receber.findFirst
    .mockResolvedValueOnce(row)
    .mockResolvedValueOnce({ ...row, situacao: "PAGO" })
  existingRelations()
  db.contas_receber.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("registro mudou", {
      code: "P2025",
      clientVersion: "test",
    }),
  )

  const response = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", { descricao: "Nova" }),
    context(),
  )

  expect(response.status).toBe(409)
  expect((await response.json()).error).toContain("situação")
})

it("não sobrescreve um cálculo quando valores foram alterados concorrentemente", async () => {
  db.contas_receber.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({
    ...row,
    valor_desconto: new Prisma.Decimal(10),
    valor_final: new Prisma.Decimal(92),
  })
  existingRelations()
  db.contas_receber.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("versão desatualizada", {
      code: "P2025",
      clientVersion: "test",
    }),
  )

  const response = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", { valor_acrescimo: 8 }),
    context(),
  )

  expect(response.status).toBe(409)
  expect(db.contas_receber.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        valor_desconto: new Prisma.Decimal(5),
        valor_acrescimo: new Prisma.Decimal(2),
        valor_final: new Prisma.Decimal(97),
      }),
    }),
  )
})

it("rejeita campos imutáveis e oculta falhas inesperadas", async () => {
  const invalid = await item.PATCH(
    await request("/api/contas_receber/1", "PATCH", { valor_final: 1 }),
    context(),
  )
  expect(invalid.status).toBe(400)

  vi.spyOn(console, "error").mockImplementation(() => {})
  db.contas_receber.findFirst.mockRejectedValue(new Error("interno"))
  const response = await item.GET(
    new Request(origin + "/api/contas_receber/1", {
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

it("aplica o limite de leitura durante uma rajada concorrente", async () => {
  resetRateLimitsForTests()
  db.contas_receber.findMany.mockResolvedValue([])
  db.contas_receber.count.mockResolvedValue(0)

  const responses = await Promise.all(
    Array.from({ length: 125 }, () =>
      request("/api/contas_receber").then((req) => collection.GET(req)),
    ),
  )
  const statuses = responses.map((response) => response.status)

  expect(statuses.filter((status) => status === 200)).toHaveLength(120)
  expect(statuses.filter((status) => status === 429)).toHaveLength(5)
  resetRateLimitsForTests()
})
