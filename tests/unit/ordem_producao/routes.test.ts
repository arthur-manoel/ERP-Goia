import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import * as collection from "../../../src/app/api/ordem_producao/route"
import * as route from "../../../src/app/api/ordem_producao/[id]/route"
import { POST as liberar } from "../../../src/app/api/ordem_producao/[id]/liberar/route"
import { POST as iniciar } from "../../../src/app/api/ordem_producao/[id]/iniciar/route"
import { POST as pausar } from "../../../src/app/api/ordem_producao/[id]/pausar/route"
import { POST as retomar } from "../../../src/app/api/ordem_producao/[id]/retomar/route"
import { POST as concluir } from "../../../src/app/api/ordem_producao/[id]/concluir/route"
import { PUT as apontar } from "../../../src/app/api/ordem_producao/[id]/itens/[itemId]/producao/route"
import {
  GET as listItems,
  POST as addItem,
} from "../../../src/app/api/ordem_producao/[id]/itens/route"
import { GET as listStages } from "../../../src/app/api/ordem_producao/[id]/etapas/route"
import {
  PATCH as editItem,
  DELETE as removeItem,
} from "../../../src/app/api/ordem_producao/[id]/itens/[itemId]/route"
import * as flowRepository from "../../../src/modules/fluxos/fluxos.repository"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
const decimal = (v: string | number) => new Prisma.Decimal(v)
const counters = {
  ordem_producao_item: 0,
  ordem_producao_fluxo_setor: 0,
  ordem_producao_movimentacao_setor: 0,
  compras: 0,
  pedido_compra: 0,
  reserva_estoque: 0,
  consumo_producao: 0,
  necessidade_producao: 0,
}
const base = {
  id: 1,
  id_empresa: 10,
  id_usuario: 1,
  numero: "OP-1",
  id_pedido_cliente: null,
  id_local_estoque: null,
  id_setor: null,
  status: "PLANEJADA",
  prioridade: "NORMAL",
  quantidade_planejada: decimal(0),
  data_inicio: null,
  data_previsao: null,
  data_conclusao: null,
  observacao: null,
  _count: { ...counters },
}
let row: Record<string, unknown>
let stages: Array<{
  id: number
  id_setor: number
  ordem: number
  status: string
  data_inicio: Date | null
  data_conclusao: Date | null
}>
let snapshot: boolean
let item: {
  id: number
  id_produto: number
  quantidade: Prisma.Decimal
  quantidade_produzida: Prisma.Decimal
  ordem_producao_consumo_planejado: object[]
}
function membership(
  admin = false,
  permissions = {
    pode_ler: true,
    pode_criar: true,
    pode_editar: true,
    pode_excluir: true,
  },
) {
  return {
    id_empresa: 10,
    nivel_acesso: admin ? "EMPRESA" : "USUARIO",
    usuarios: { nivel_acesso: "USUARIO" },
    permissoes_usuario: [{ recurso: "ORDENS_PRODUCAO", ...permissions }],
  }
}
beforeEach(() => {
  resetRateLimitsForTests()
  row = {
    ...base,
    _count: { ...counters },
    ordem_producao_item: [],
    ordem_producao_fluxo_setor: [],
    ordem_producao_movimentacao_setor: [],
  }
  stages = []
  snapshot = false
  item = {
    id: 8,
    id_produto: 20,
    quantidade: decimal(10),
    quantidade_produzida: decimal(0),
    ordem_producao_consumo_planejado: [{ id_materia_prima: 22 }],
  }
  db.usuario_empresa.findMany.mockResolvedValue([membership()])
  db.usuario_empresa.findFirst.mockResolvedValue({ id: 1 })
  db.ordem_producao.findFirst.mockImplementation(async ({ where }) =>
    where.id === 1 && where.id_empresa === 10 ? { ...row } : null,
  )
  db.ordem_producao.update.mockImplementation(async ({ data }) => {
    Object.assign(row, data)
    return { ...row }
  })
  db.ordem_producao.updateMany.mockImplementation(async ({ where, data }) => {
    if (where.status !== row.status || where.id_setor !== row.id_setor)
      return { count: 0 }
    Object.assign(row, data)
    return { count: 1 }
  })
  db.ordem_producao.create.mockImplementation(async ({ data }) => ({
    ...base,
    ...data,
  }))
  db.$queryRaw.mockImplementation(async (query) => {
    const sql = Array.from(query.strings ?? query).join("?")
    if (sql.includes("SELECT snapshot"))
      return snapshot
        ? [{ snapshot: { fluxoId: 1, setores: [{ id: 3 }] } }]
        : []
    if (sql.includes("FROM ordem_producao_fluxo_setor"))
      return stages.map((s) => ({ ...s }))
    return [{ id: 1 }]
  })
  db.$executeRaw.mockImplementation(async (query, ...values) => {
    const current = stages.find((s) => s.id === values[0])
    if (!current) return 0
    const start = Array.from(query)
      .join("")
      .includes("SET status = 'EM_PRODUCAO'")
    current.status = start ? "EM_PRODUCAO" : "CONCLUIDA"
    return 1
  })
  for (const model of [
    db.reserva_estoque,
    db.consumo_producao,
    db.movimentacao_estoque,
    db.compras,
    db.pedido_compra,
    db.necessidade_producao,
    db.ordem_producao_movimentacao_setor,
    db.ordem_producao_apontamento,
    db.contas_pagar,
  ])
    model.count.mockResolvedValue(0)
  db.produto_empresa.findFirst.mockResolvedValue({ id: 1 })
  db.produto_empresa.count.mockResolvedValue(1)
  db.ficha_tecnica.findFirst.mockResolvedValue({
    ficha_tecnica_item: [{ id_produto_componente: 22, quantidade: decimal(1) }],
  })
  db.setores.findFirst.mockResolvedValue({ id: 3 })
  db.ordem_producao_item.findFirst.mockImplementation(async () => ({ ...item }))
  db.ordem_producao_item.updateMany.mockImplementation(
    async ({ where, data }) => {
      if (!item.quantidade_produzida.eq(where.quantidade_produzida))
        return { count: 0 }
      item.quantidade_produzida = decimal(data.quantidade_produzida)
      return { count: 1 }
    },
  )
})
async function req(method: string, body?: unknown) {
  return request("/api/ordem_producao/1", method, body)
}
function production() {
  row.status = "EM_PRODUCAO"
  row.id_setor = 3
  row.data_inicio = new Date(Date.now() - 1000)
  row.quantidade_planejada = decimal(10)
  row.ordem_producao_item = [item]
  snapshot = true
  stages = [
    {
      id: 9,
      id_setor: 3,
      ordem: 1,
      status: "EM_PRODUCAO",
      data_inicio: new Date(),
      data_conclusao: null,
    },
  ]
}
it("não cria contadores ou acessa banco para tokens inválidos", async () => {
  for (let i = 0; i < 5100; i++) {
    const response = await collection.GET(
      new Request("http://localhost/api/ordem_producao", {
        headers: { Authorization: `Bearer invalid-${i}` },
      }),
    )
    expect(response.status).toBe(401)
  }
  db.ordem_producao.findMany.mockResolvedValue([])
  db.ordem_producao.count.mockResolvedValue(0)
  expect((await collection.GET(await req("GET"))).status).toBe(200)
  expect(db.usuario_empresa.findMany).toHaveBeenCalledTimes(1)
})
it("aplica filtros, paginação e escopo diretamente no banco", async () => {
  db.ordem_producao.findMany.mockResolvedValue([base])
  db.ordem_producao.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/ordem_producao?page=2&limit=10&busca=OP&status=PLANEJADA&ordenar_por=numero&ordem=asc",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    count: 21,
    totalPages: 3,
    page: 2,
    limit: 10,
  })
  expect(db.ordem_producao.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 10,
      take: 10,
      where: {
        AND: expect.arrayContaining([
          { id_empresa: 10 },
          { numero: { contains: "OP" } },
        ]),
      },
      orderBy: [{ numero: "asc" }, { id: "asc" }],
    }),
  )
})
it("deriva empresa e usuário do token e aplica defaults", async () => {
  const response = await collection.POST(
    await req("POST", { numero: " OP-1 " }),
  )
  expect(response.status).toBe(201)
  expect(db.ordem_producao.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id_empresa: 10,
      id_usuario: 1,
      numero: "OP-1",
      status: "PLANEJADA",
      quantidade_planejada: "0",
    }),
  })
  expect(db.auditoria.create).toHaveBeenCalledOnce()
})
it("rejeita outra empresa no header, corpo e filtros", async () => {
  const r = await req("GET")
  r.headers.set("X-Empresa-Id", "99")
  expect((await collection.GET(r)).status).toBe(403)
  expect(
    (await collection.POST(await req("POST", { numero: "OP", id_empresa: 99 })))
      .status,
  ).toBe(403)
  expect(
    (await collection.GET(await request("/api/ordem_producao?id_empresa=99")))
      .status,
  ).toBe(403)
  expect(db.ordem_producao.create).not.toHaveBeenCalled()
})
it("permite administrador vinculado e exige permissão por operação de usuários comuns", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    membership(false, {
      pode_ler: true,
      pode_criar: false,
      pode_editar: true,
      pode_excluir: false,
    }),
  ])
  expect(
    (await route.PATCH(await req("PATCH", { observacao: "teste" }), context()))
      .status,
  ).toBe(200)
  expect((await route.DELETE(await req("DELETE"), context())).status).toBe(403)
  expect(
    (await route.PATCH(await req("PATCH", { status: "CANCELADA" }), context()))
      .status,
  ).toBe(400)
  db.usuario_empresa.findMany.mockResolvedValue([membership(true)])
  expect((await route.DELETE(await req("DELETE"), context())).status).toBe(200)
})
it("404 precede duplicidade e consultas por ID incluem empresa", async () => {
  expect(
    (
      await route.PATCH(
        await req("PATCH", { numero: "existente" }),
        context("99"),
      )
    ).status,
  ).toBe(404)
  expect(db.ordem_producao.update).not.toHaveBeenCalled()
  expect(db.ordem_producao.findFirst).not.toHaveBeenCalledWith(
    expect.objectContaining({ where: { id_empresa: 10, numero: "existente" } }),
  )
})
it("conflito de unicidade do banco é 409 sem detalhes internos", async () => {
  db.ordem_producao.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("sql privado", {
      code: "P2002",
      clientVersion: "7.10.0",
    }),
  )
  const response = await collection.POST(await req("POST", { numero: "OP" }))
  expect(response.status).toBe(409)
  expect(JSON.stringify(await response.json())).not.toContain("sql privado")
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
it("relacionamento inválido retorna 400 sem gravar", async () => {
  db.locais_estoque.findFirst.mockResolvedValue(null)
  expect(
    (
      await collection.POST(
        await req("POST", { numero: "OP", id_local_estoque: 99 }),
      )
    ).status,
  ).toBe(400)
  expect(db.locais_estoque.findFirst).toHaveBeenCalledWith({
    where: { id: 99, id_empresa: 10, status: "ATIVO" },
    select: { id: true },
  })
  expect(db.ordem_producao.create).not.toHaveBeenCalled()
})
it("não libera ordem vazia e impede alterações fora do planejamento", async () => {
  expect((await liberar(await req("POST"), context())).status).toBe(409)
  row.status = "LIBERADA"
  expect(
    (
      await route.PATCH(
        await req("PATCH", { quantidade_planejada: "4" }),
        context(),
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await route.PATCH(
        await req("PATCH", { observacao: "anotação" }),
        context(),
      )
    ).status,
  ).toBe(200)
})
it("início, pausa e retomada preservam a data original e impedem duplicação", async () => {
  production()
  row.status = "LIBERADA"
  row.data_inicio = null
  stages[0].status = "PENDENTE"
  expect((await iniciar(await req("POST"), context())).status).toBe(200)
  const date = row.data_inicio
  expect((await iniciar(await req("POST"), context())).status).toBe(409)
  expect((await pausar(await req("POST"), context())).status).toBe(200)
  expect((await retomar(await req("POST"), context())).status).toBe(200)
  expect(row.data_inicio).toEqual(date)
})
it.each([
  "reserva_estoque",
  "consumo_producao",
  "movimentacao_estoque",
  "compras",
  "pedido_compra",
  "necessidade_producao",
  "ordem_producao_movimentacao_setor",
  "ordem_producao_apontamento",
  "contas_pagar",
] as const)(
  "bloqueia cancelamento com %s sem apagar histórico",
  async (model) => {
    db[model].count.mockResolvedValue(1)
    expect((await route.DELETE(await req("DELETE"), context())).status).toBe(
      409,
    )
    expect(db.ordem_producao.updateMany).not.toHaveBeenCalled()
    expect(db.ordem_producao.delete).not.toHaveBeenCalled()
  },
)
it.each(["CONCLUIDA", "CANCELADA"])(
  "não edita ou cancela %s",
  async (status) => {
    row.status = status
    expect(
      (await route.PATCH(await req("PATCH", { observacao: "x" }), context()))
        .status,
    ).toBe(409)
    expect((await route.DELETE(await req("DELETE"), context())).status).toBe(
      409,
    )
  },
)
it("conclusão exige produção real e respeita quantidades diferentes do plano", async () => {
  production()
  expect((await concluir(await req("POST"), context())).status).toBe(409)
  expect(stages[0].status).toBe("EM_PRODUCAO")
  item.quantidade_produzida = decimal("7.125")
  expect((await concluir(await req("POST"), context())).status).toBe(200)
  expect(item.quantidade_produzida.toString()).toBe("7.125")
  expect(row.status).toBe("CONCLUIDA")
  expect(db.ordem_producao_item.update).not.toHaveBeenCalled()
  expect(db.movimentacao_estoque.create).not.toHaveBeenCalled()
})
it("registra apontamento atômico por total, sem duplicar o mesmo comando", async () => {
  production()
  const params = { params: Promise.resolve({ id: "1", itemId: "8" }) }
  const input = { quantidade_produzida: "7.125", quantidade_esperada: "0" }
  expect((await apontar(await req("PUT", input), params)).status).toBe(200)
  expect((await apontar(await req("PUT", input), params)).status).toBe(200)
  expect(db.ordem_producao_apontamento.create).toHaveBeenCalledOnce()
  expect(db.ordem_producao_apontamento.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id_ordem_producao: 1,
      id_ordem_producao_item: 8,
      id_usuario: 1,
      quantidade_produzida: decimal("7.125"),
    }),
  })
  expect(
    (
      await apontar(
        await req("PUT", {
          quantidade_produzida: "8",
          quantidade_esperada: "0",
        }),
        params,
      )
    ).status,
  ).toBe(409)
})
it("falha concorrente condicional não cria apontamento nem auditoria", async () => {
  production()
  db.ordem_producao_item.updateMany.mockResolvedValue({ count: 0 })
  expect(
    (
      await apontar(
        await req("PUT", {
          quantidade_produzida: "3",
          quantidade_esperada: "0",
        }),
        { params: Promise.resolve({ id: "1", itemId: "8" }) },
      )
    ).status,
  ).toBe(409)
  expect(db.ordem_producao_apontamento.create).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
it("vínculo ativo é obrigatório inclusive para ADMIN; ID de outra empresa não é exposto", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([])
  expect((await route.GET(await req("GET"), context())).status).toBe(403)
  expect(db.ordem_producao.findFirst).not.toHaveBeenCalled()
  db.usuario_empresa.findMany.mockResolvedValue([membership(true)])
  expect((await route.GET(await req("GET"), context("99"))).status).toBe(404)
  expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_usuario: 1,
        status: "ATIVO",
        empresas: { status: "ATIVA" },
        usuarios: { status: "ATIVO" },
      },
    }),
  )
})
it("PUT exige campos completos e PATCH não altera campos omitidos", async () => {
  expect(
    (await route.PUT(await req("PUT", { numero: "OP-1" }), context())).status,
  ).toBe(400)
  expect(
    (await route.PATCH(await req("PATCH", { observacao: "nova" }), context()))
      .status,
  ).toBe(200)
  expect(db.ordem_producao.update).toHaveBeenCalledWith({
    where: { id: 1, id_empresa: 10 },
    data: { observacao: "nova" },
  })
})
it("meta geral pode ser ajustada em ordens com vários itens sem redistribuir consumos", async () => {
  row._count = { ...counters, ordem_producao_item: 2 }
  row.ordem_producao_item = [item, { ...item, id: 9 }]
  expect(
    (
      await route.PATCH(
        await req("PATCH", { quantidade_planejada: "20" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(row.quantidade_planejada).toBe("20")
  expect(db.ordem_producao_consumo_planejado.deleteMany).not.toHaveBeenCalled()
  expect(db.ordem_producao_item.updateMany).not.toHaveBeenCalled()
})
it("sub-recursos são paginados e incluem o escopo da empresa", async () => {
  db.ordem_producao_item.findMany.mockResolvedValue([item])
  db.ordem_producao_item.count.mockResolvedValue(11)
  db.ordem_producao_fluxo_setor.findMany.mockResolvedValue([])
  db.ordem_producao_fluxo_setor.count.mockResolvedValue(0)
  const response = await listItems(
    await request("/api/ordem_producao/1/itens?page=2&limit=10"),
    context(),
  )
  expect((await response.json()).data).toMatchObject({
    count: 11,
    totalPages: 2,
    page: 2,
  })
  expect(db.ordem_producao_item.findMany).toHaveBeenCalledWith({
    where: { id_ordem_producao: 1, ordem_producao: { id_empresa: 10 } },
    skip: 10,
    take: 10,
    orderBy: { id: "asc" },
  })
  expect(
    (
      await listStages(
        await request("/api/ordem_producao/1/etapas?limit=101"),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(
    (await listStages(await request("/api/ordem_producao/1/etapas"), context()))
      .status,
  ).toBe(200)
})
it("item cria snapshot, etapas e consumo previsto na mesma transação", async () => {
  vi.spyOn(flowRepository, "fluxoProduto").mockResolvedValue({
    id: 1,
    nome: "Fluxo",
    descricao: null,
    status: "ATIVO",
    createdAt: new Date(),
    updatedAt: new Date(),
    setores: [
      {
        id: 3,
        nome: "Corte",
        descricao: null,
        status: "ATIVO",
        createdAt: new Date(),
        updatedAt: new Date(),
        ordem: 1,
      },
    ],
  })
  db.ordem_producao_item.create.mockResolvedValue(item)
  const response = await addItem(
    await req("POST", { id_produto: 20, quantidade: "3.125" }),
    context(),
  )
  expect(response.status).toBe(201)
  expect(db.ordem_producao_fluxo_setor.createMany).toHaveBeenCalledWith({
    data: [{ id_ordem_producao: 1, id_setor: 3, ordem: 1 }],
  })
  expect(db.ordem_producao_consumo_planejado.createMany).toHaveBeenCalledWith({
    data: [
      {
        id_ordem_producao: 1,
        id_ordem_producao_item: 8,
        id_materia_prima: 22,
        quantidade_por_peca: decimal(1),
        quantidade_necessaria: decimal("3.125"),
      },
    ],
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
  })
  expect(db.auditoria.create).toHaveBeenCalledOnce()
})
it("itens de uma ordem em execução não podem ser alterados nem removidos", async () => {
  production()
  const params = { params: Promise.resolve({ id: "1", itemId: "8" }) }
  expect(
    (await editItem(await req("PATCH", { quantidade: "1" }), params)).status,
  ).toBe(409)
  expect((await removeItem(await req("DELETE"), params)).status).toBe(409)
  expect(db.ordem_producao_item.deleteMany).not.toHaveBeenCalled()
})
it("dois apontamentos concorrentes com o mesmo saldo esperado não duplicam produção", async () => {
  production()
  const params = { params: Promise.resolve({ id: "1", itemId: "8" }) }
  const results = await Promise.all(
    ["3", "4"].map(async (total) =>
      apontar(
        await req("PUT", {
          quantidade_produzida: total,
          quantidade_esperada: "0",
        }),
        params,
      ),
    ),
  )
  expect(results.map((result) => result.status).sort()).toEqual([200, 409])
  expect(db.ordem_producao_apontamento.create).toHaveBeenCalledOnce()
})
it("pendências operacionais impedem conclusão antes de atualizar a etapa", async () => {
  production()
  item.quantidade_produzida = decimal(3)
  db.reserva_estoque.count.mockResolvedValue(1)
  expect((await concluir(await req("POST"), context())).status).toBe(409)
  expect(db.$executeRaw).not.toHaveBeenCalled()
  expect(row.status).toBe("EM_PRODUCAO")
})
it("rate limit usa identidade autenticada mesmo mudando caixa do Bearer e IP", async () => {
  db.ordem_producao.findMany.mockResolvedValue([])
  db.ordem_producao.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 125 }, (_, index) =>
      collection.GET(
        new Request("http://localhost/api/ordem_producao", {
          headers: {
            Authorization: `${index % 2 ? "bearer" : "Bearer"} test-token`,
            "X-Forwarded-For": String(index),
          },
        }),
      ),
    ),
  )
  expect(responses.filter((r) => r.status === 200)).toHaveLength(120)
  expect(responses.filter((r) => r.status === 429)).toHaveLength(5)
})
