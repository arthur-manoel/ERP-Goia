import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/despesas/route"
import * as item from "../../../src/app/api/despesas/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
const input = {
  id_empresa: 10,
  id_categoria: 30,
  descricao: "Energia",
  data_despesa: "2026-10-24",
  valor: "100.00",
}
const row = {
  id: 1,
  ...input,
  id_conta_pagar: null,
  situacao: "ABERTA",
  valor: new Prisma.Decimal(100),
  data_despesa: new Date("2026-10-24T00:00:00Z"),
  observacao: null,
  data_cadastro: new Date(),
  data_atualizacao: new Date(),
}
beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.empresas.findFirst.mockResolvedValue({ id: 10 })
  db.categoria_financeira.findFirst.mockResolvedValue({ id: 30 })
  db.contas_pagar.findFirst.mockResolvedValue({
    id: 20,
    id_empresa: 10,
    situacao: "ABERTO",
  })
  db.despesas.findFirst.mockResolvedValue(row)
  db.despesas.create.mockResolvedValue(row)
  db.despesas.update.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.movimentacoes_financeiras.count.mockResolvedValue(0)
})
const actions = [
  ["GET", "pode_ler", (req: Request) => collection.GET(req)],
  ["POST", "pode_criar", (req: Request) => collection.POST(req)],
  ["GET ID", "pode_ler", (req: Request) => item.GET(req, context())],
  ["PUT", "pode_editar", (req: Request) => item.PUT(req, context())],
  ["PATCH", "pode_editar", (req: Request) => item.PATCH(req, context())],
  ["DELETE", "pode_excluir", (req: Request) => item.DELETE(req, context())],
] as const
it.each(actions)(
  "%s valida token, papel e permissão por operação",
  async (_, action, invoke) => {
    const req = await request("/api/despesas")
    req.headers.delete("Authorization")
    expect((await invoke(req)).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
    req.headers.set("Authorization", "Bearer production-token")
    expect((await invoke(req)).status).toBe(403)
    req.headers.set("Authorization", "Bearer finance-token")
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await invoke(req)).status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              permissoes_usuario: {
                some: { recurso: "FINANCEIRO", [action]: true },
              },
            },
          ]),
        }),
      }),
    )
    expect(db.despesas.findFirst).not.toHaveBeenCalled()
  },
)
it("cria e audita usando o usuário autenticado e snapshots serializados", async () => {
  const req = await request("/api/despesas", "POST", input)
  req.headers.set("Authorization", "Bearer finance-token")
  expect((await collection.POST(req)).status).toBe(201)
  expect(db.auditoria.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id_empresa: 10,
      id_usuario: 2,
      tabela: "despesas",
      id_registro: 1,
      acao: "INSERT",
      dados_anteriores: null,
    }),
  })
  expect(
    JSON.parse(db.auditoria.create.mock.calls[0][0].data.dados_novos),
  ).toMatchObject({ valor: "100", evento_financeiro: "CRIACAO" })
})
it.each(["empresas", "categoria_financeira"] as const)(
  "retorna 400 para relação %s inexistente",
  async (model) => {
    db[model].findFirst.mockResolvedValue(null)
    expect(
      (await collection.POST(await request("/api/despesas", "POST", input)))
        .status,
    ).toBe(400)
    expect(db.despesas.create).not.toHaveBeenCalled()
  },
)
it("valida conta a pagar na empresa e rejeita canceladas", async () => {
  db.contas_pagar.findFirst.mockResolvedValue(null)
  expect(
    (
      await collection.POST(
        await request("/api/despesas", "POST", {
          ...input,
          id_conta_pagar: 20,
        }),
      )
    ).status,
  ).toBe(400)
  expect(db.contas_pagar.findFirst).toHaveBeenCalledWith({
    where: { id: 20, id_empresa: 10 },
  })
  db.contas_pagar.findFirst.mockResolvedValue({
    id: 20,
    id_empresa: 10,
    situacao: "CANCELADO",
  })
  expect(
    (
      await collection.POST(
        await request("/api/despesas", "POST", {
          ...input,
          id_conta_pagar: 20,
        }),
      )
    ).status,
  ).toBe(409)
  expect(db.despesas.create).not.toHaveBeenCalled()
})
it("aplica isolamento e respeita X-Empresa-Id em gravação", async () => {
  expect(
    (await collection.GET(await request("/api/despesas?id_empresa=99"))).status,
  ).toBe(403)
  expect(
    (
      await collection.POST(
        await request("/api/despesas", "POST", { ...input, id_empresa: 99 }),
      )
    ).status,
  ).toBe(403)
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const req = await request("/api/despesas", "POST", {
    ...input,
    id_empresa: 20,
  })
  req.headers.set("X-Empresa-Id", "10")
  expect((await collection.POST(req)).status).toBe(403)
  expect(db.despesas.create).not.toHaveBeenCalled()
})
it("pagina e filtra no banco com total e intervalo final inclusivo", async () => {
  db.despesas.findMany.mockResolvedValue([row])
  db.despesas.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/despesas?page=2&limit=10&situacao=ABERTA&busca=Energia&data_cadastro_fim=2026-10-24&ordenar_por=valor&ordem=asc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    page: 2,
    limit: 10,
    count: 21,
    totalPages: 3,
  })
  const query = db.despesas.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    take: 10,
    skip: 10,
    orderBy: [{ valor: "asc" }, { id: "asc" }],
  })
  expect(query.where.AND).toContainEqual({ id_empresa: { in: [10] } })
  expect(query.where.AND).toContainEqual({
    data_cadastro: { lt: new Date("2026-10-25T00:00:00Z") },
  })
  expect(db.despesas.count).toHaveBeenCalledWith({ where: query.where })
})
it("PATCH preserva campos e PUT exige os obrigatórios", async () => {
  expect(
    (
      await item.PUT(
        await request("/api/despesas/1", "PUT", { observacao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await item.PATCH(
        await request("/api/despesas/1", "PATCH", { observacao: "Nova" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.despesas.update.mock.calls[0][0].data).not.toHaveProperty("valor")
  expect(
    (await item.PUT(await request("/api/despesas/1", "PUT", input), context()))
      .status,
  ).toBe(200)
  expect(db.despesas.update.mock.lastCall?.[0].data).toMatchObject({
    observacao: null,
    id_conta_pagar: null,
    data_atualizacao: expect.any(Date),
  })
})
it.each(["PAGA", "CANCELADA"])(
  "protege valor e relacionamentos de despesa %s",
  async (situacao) => {
    db.despesas.findFirst.mockResolvedValue({ ...row, situacao })
    for (const data of [
      { valor: 110 },
      { id_categoria: 31 },
      { id_conta_pagar: 20 },
      { situacao: "ABERTA" },
      { situacao: "CANCELADA", valor: 50 },
    ]) {
      expect(
        (
          await item.PATCH(
            await request("/api/despesas/1", "PATCH", data),
            context(),
          )
        ).status,
      ).toBe(409)
    }
    expect(db.despesas.update).not.toHaveBeenCalled()
  },
)
it("não cancela nem altera despesa paga ou com movimentações sem estorno", async () => {
  db.despesas.findFirst.mockResolvedValue({ ...row, situacao: "PAGA" })
  expect(
    (await item.DELETE(await request("/api/despesas/1", "DELETE"), context()))
      .status,
  ).toBe(409)
  db.despesas.findFirst.mockResolvedValue(row)
  db.movimentacoes_financeiras.count.mockResolvedValue(1)
  expect(
    (
      await item.PATCH(
        await request("/api/despesas/1", "PATCH", { valor: 120 }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(
    (await item.DELETE(await request("/api/despesas/1", "DELETE"), context()))
      .status,
  ).toBe(409)
  expect(db.despesas.update).not.toHaveBeenCalled()
})
it("não baixa por simples mudança para PAGA e não cria movimentação implícita", async () => {
  expect(
    (
      await collection.POST(
        await request("/api/despesas", "POST", { ...input, situacao: "PAGA" }),
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await item.PATCH(
        await request("/api/despesas/1", "PATCH", { situacao: "PAGA" }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(db.movimentacoes_financeiras.create).not.toHaveBeenCalled()
  expect(db.despesas.create).not.toHaveBeenCalled()
})
it("permite metadados de despesa paga preservando valor e auditando antes/depois", async () => {
  db.despesas.findFirst.mockResolvedValue({ ...row, situacao: "PAGA" })
  expect(
    (
      await item.PATCH(
        await request("/api/despesas/1", "PATCH", { observacao: "Auditado" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.despesas.update.mock.calls[0][0].data).not.toHaveProperty("valor")
  const audit = db.auditoria.create.mock.calls[0][0].data
  expect(audit.acao).toBe("UPDATE")
  expect(JSON.parse(audit.dados_anteriores).situacao).toBe("PAGA")
})
it("cancela logicamente e audita, sem apagar o histórico", async () => {
  expect(
    (await item.DELETE(await request("/api/despesas/1", "DELETE"), context()))
      .status,
  ).toBe(200)
  expect(db.despesas.delete).not.toHaveBeenCalled()
  const audit = db.auditoria.create.mock.calls[0][0].data
  expect(JSON.parse(audit.dados_novos)).toMatchObject({
    situacao: "CANCELADA",
    evento_financeiro: "CANCELAMENTO",
  })
})
it("falha na auditoria impede sucesso da escrita transacional", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.auditoria.create.mockRejectedValue(new Error("auditoria indisponível"))
  expect(
    (await collection.POST(await request("/api/despesas", "POST", input)))
      .status,
  ).toBe(500)
  await expect(db.$transaction.mock.results[0].value).rejects.toThrow(
    "auditoria indisponível",
  )
})
it("usa hash para observação longa no log sem alterar o texto no registro", async () => {
  const observacao = "x".repeat(20000)
  db.despesas.create.mockResolvedValue({ ...row, observacao })
  expect(
    (
      await collection.POST(
        await request("/api/despesas", "POST", { ...input, observacao }),
      )
    ).status,
  ).toBe(201)
  expect(db.despesas.create.mock.calls[0][0].data.observacao).toBe(observacao)
  expect(
    JSON.parse(db.auditoria.create.mock.calls[0][0].data.dados_novos)
      .observacao,
  ).toMatchObject({ bytes: 20000, sha256: expect.any(String) })
})
it("IDs fora do escopo são 404 e erros internos não vazam", async () => {
  db.despesas.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/despesas/1"), context())).status,
  ).toBe(404)
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.despesas.findFirst.mockRejectedValue(new Error("segredo"))
  const response = await item.GET(await request("/api/despesas/1"), context())
  expect(response.status).toBe(500)
  expect((await response.json()).error).toBe("Erro interno do servidor.")
})
it("limita rajadas pelo usuário autenticado", async () => {
  db.despesas.findMany.mockResolvedValue([])
  db.despesas.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, async () =>
      collection.GET(await request("/api/despesas")),
    ),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    120,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    5,
  )
})
