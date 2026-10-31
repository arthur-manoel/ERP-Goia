import { beforeEach, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { Prisma } from "../../../src/generated/prisma/client"
import { db } from "../../helpers/prisma"
import {
  entradaHandler,
  saidaHandler,
  ajusteHandler,
  saldoHandler,
} from "../../../src/modules/movimentacoes-estoque/router"

const tx = {
  $queryRaw: vi.fn(),
  produto_empresa: { findFirst: vi.fn() },
  locais_estoque: { findFirst: vi.fn() },
  setores: { findFirst: vi.fn() },
  estoque: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  movimentacao_estoque: {
    groupBy: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
  },
  kardex: { create: vi.fn() },
  auditoria: { create: vi.fn() },
}
const body = {
  idProduto: 1,
  idLocalEstoque: 2,
  idSetor: 3,
  quantidade: "0.001",
  observacao: "Reproducao isolada da revisao",
}
function esperadoDaColecao(resposta: {
  saldo: string
  saldoArmazenado: string
  precisaAbertura: boolean
}) {
  const colecao = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/postman/movimentacoes-estoque.postman_collection.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    item: Array<{ name: string; event: Array<{ script: { exec: string[] } }> }>
  }
  const etapa = colecao.item.find((item) => item.name.startsWith("02 -"))
  if (!etapa) throw new Error("Consulta inicial ausente da coleção.")
  const variaveis = new Map<string, string>()
  runInNewContext(etapa.event[0].script.exec.join("\n"), {
    pm: {
      test: (_nome: string, verificar: () => void) => verificar(),
      response: {
        json: () => resposta,
        to: { have: { status: (status: number) => expect(status).toBe(200) } },
      },
      collectionVariables: {
        set: (key: string, value: string) => variaveis.set(key, value),
      },
    },
  })
  return variaveis.get("saldoEsperado")
}
function request(data: unknown = body) {
  return new Request("http://localhost/api/estoque/entradas", {
    method: "POST",
    headers: {
      Authorization: "Bearer production-token",
      "X-Empresa-Id": "10",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
}
function query() {
  return new Request(
    "http://localhost/api/estoque/saldo?idProduto=1&idLocalEstoque=2",
    {
      headers: {
        Authorization: "Bearer production-token",
        "X-Empresa-Id": "10",
      },
    },
  )
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.usuario_empresa.findMany.mockResolvedValue([
    {
      id_empresa: 10,
      nivel_acesso: "USUARIO",
      usuarios: { nivel_acesso: "USUARIO" },
      permissoes_usuario: [
        { pode_ler: true, pode_criar: true, pode_editar: true },
      ],
    },
  ])
  db.$transaction.mockImplementation(async (run) => run(tx))
  tx.$queryRaw.mockResolvedValue([{ id: 1 }])
  tx.produto_empresa.findFirst.mockResolvedValue({ id: 1 })
  tx.locais_estoque.findFirst.mockResolvedValue({ id: 2 })
  tx.setores.findFirst.mockResolvedValue({ id: 3 })
  tx.estoque.findUnique.mockResolvedValue({
    id: 4,
    id_setor: 3,
    quantidade: new Prisma.Decimal(10),
    quantidade_reservada: new Prisma.Decimal(0),
  })
  tx.estoque.updateMany.mockResolvedValue({ count: 1 })
  tx.movimentacao_estoque.groupBy.mockResolvedValue([
    {
      tipo: "ENTRADA_NF",
      _sum: { quantidade: new Prisma.Decimal(10) },
      _count: { _all: 1 },
    },
  ])
  tx.movimentacao_estoque.create.mockResolvedValue({ id: 7 })
})

it("criar sem ler não permite obter saldos por uma escrita", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    {
      id_empresa: 10,
      nivel_acesso: "USUARIO",
      usuarios: { nivel_acesso: "USUARIO" },
      permissoes_usuario: [
        { pode_ler: false, pode_criar: true, pode_editar: false },
      ],
    },
  ])
  const denied = await saldoHandler(query())
  expect(denied.status).toBe(403)
  const accepted = await entradaHandler(request())
  const result = await accepted.json()
  expect(accepted.status).toBe(403)
  expect(result).not.toHaveProperty("saldoAnterior")
  expect(result).not.toHaveProperty("saldoAtual")
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
})

it("recupera abertura antiga de compras somente com kardex que comprova toda a cadeia", async () => {
  // Estado produzido pelo writer de compras da develop: atualiza a projecao
  // 10 -> 15 e registra apenas ENTRADA_NF 5, sem abertura do saldo antigo.
  tx.estoque.findUnique.mockResolvedValue({
    id: 4,
    id_setor: 3,
    quantidade: new Prisma.Decimal(15),
    quantidade_reservada: new Prisma.Decimal(0),
  })
  tx.movimentacao_estoque.groupBy.mockResolvedValue([
    {
      tipo: "ENTRADA_NF",
      _sum: { quantidade: new Prisma.Decimal(5) },
      _count: { _all: 1 },
    },
  ])
  tx.movimentacao_estoque.findMany.mockResolvedValue([
    {
      id: 20,
      id_setor: 3,
      tipo: "ENTRADA_NF",
      origem_tipo: "COMPRA_RECEBIMENTO",
      quantidade: new Prisma.Decimal(5),
      data_movimentacao: new Date("2026-10-01T12:00:00Z"),
      kardex: {
        id_empresa: 10,
        id_produto: 1,
        id_local_estoque: 2,
        id_setor: 3,
        tipo_movimentacao: "ENTRADA",
        quantidade: new Prisma.Decimal(5),
        saldo_anterior: new Prisma.Decimal(10),
        saldo_atual: new Prisma.Decimal(15),
      },
    },
  ])
  const response = await ajusteHandler(
    request({
      idProduto: body.idProduto,
      idLocalEstoque: body.idLocalEstoque,
      idSetor: body.idSetor,
      saldoNovo: "14.000",
      saldoEsperado: esperadoDaColecao({
        saldo: "5.000",
        saldoArmazenado: "15.000",
        precisaAbertura: false,
      }),
      observacao: "Inventário pelo fluxo real da coleção",
    }),
  )
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({
    saldoAnterior: "15.000",
    saldoAtual: "14.000",
    idMovimentacaoAbertura: 7,
  })
  expect(tx.auditoria.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      dados_novos: expect.stringContaining('"fundamento":"KARDEX_COMPRAS"'),
    }),
  })
})

it.each([
  { saldo: "5.000", saldoArmazenado: "15.000", precisaAbertura: false },
  { saldo: "0.000", saldoArmazenado: "10.000", precisaAbertura: true },
  { saldo: "8.000", saldoArmazenado: "8.000", precisaAbertura: false },
  { saldo: "0.000", saldoArmazenado: "0.000", precisaAbertura: false },
])(
  "coleção usa o saldo físico esperado inclusive no legado que já recebeu compras: %j",
  (resposta) => {
    expect(esperadoDaColecao(resposta)).toBe(resposta.saldoArmazenado)
  },
)

it.each(["1213", "1205"])(
  "REVISAO: disputa SQL P2010/%s deve retornar409 e nao500",
  async (code) => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Disputa SQL simulada", {
        code: "P2010",
        clientVersion: "7.10.0",
        meta: { code, message: "Deadlock ou lock timeout" },
      }),
    )
    const response = await saidaHandler(request())
    expect(response.status).toBe(409)
  },
)

it("REVISAO: disputa DriverAdapterError deve retornar409 e nao500", async () => {
  db.$transaction.mockRejectedValue({
    name: "DriverAdapterError",
    cause: { kind: "TransactionWriteConflict", originalCode: "1213" },
  })
  const response = await saidaHandler(request())
  expect(response.status).toBe(409)
})

it("REVISAO: erro inesperado nao deve levar SQL/credenciais ao logger", async () => {
  const sensitive = new Error("SQL e credencial sentinela-da-revisao")
  db.$transaction.mockRejectedValue(sensitive)
  const response = await entradaHandler(request())
  expect(response.status).toBe(500)
  expect(await response.text()).not.toContain("sentinela-da-revisao")
  expect(console.error).not.toHaveBeenCalledWith(
    "Falha na API de movimentações de estoque",
    sensitive,
  )
  expect(console.error).toHaveBeenCalledWith(
    "Falha na API de movimentações de estoque.",
  )
})

it("CONTROLE: quantidade maior que saldo retorna409 sem gravar", async () => {
  const response = await saidaHandler(request({ ...body, quantidade: "11" }))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({
    error: "Saldo insuficiente para esta saída.",
  })
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
})

it("CONTROLE: ajuste desatualizado retorna409 sem gravar", async () => {
  const { quantidade: ignored, ...posicao } = body
  void ignored
  const response = await ajusteHandler(
    request({ ...posicao, saldoNovo: "8", saldoEsperado: "9" }),
  )
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({
    error: "O saldo mudou. Consulte novamente antes de ajustar.",
  })
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
})

it.each([saidaHandler, ajusteHandler])(
  "saída e ajuste também exigem leitura para retornar saldos",
  async (handler) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      {
        id_empresa: 10,
        nivel_acesso: "USUARIO",
        usuarios: { nivel_acesso: "USUARIO" },
        permissoes_usuario: [
          { pode_ler: false, pode_criar: true, pode_editar: true },
        ],
      },
    ])
    expect((await handler(request())).status).toBe(403)
    expect(tx.estoque.updateMany).not.toHaveBeenCalled()
  },
)

it("limita o corpo antes de validar ou gravar e não depende do Content-Length", async () => {
  const response = await entradaHandler(
    request({ ...body, observacao: "a".repeat(65536) }),
  )
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({
    error: "JSON excede o limite de 64 KiB.",
  })
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
})

it.each([
  {},
  { ...body, quantidade: "abc" },
  { ...body, observacao: "" },
  { ...body, campoExtra: "x" },
])("campos inválidos retornam mensagens em português", async (data) => {
  const response = await entradaHandler(request(data))
  expect(response.status).toBe(400)
  const result = await response.json()
  expect(result.error).not.toMatch(
    /expected|received|Invalid|Too small|Unrecognized/,
  )
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
})

it("texto em quantidade gera uma única orientação", async () => {
  const response = await entradaHandler(request({ ...body, quantidade: "abc" }))
  expect(await response.json()).toEqual({
    error:
      "quantidade: Informe quantidade não negativa com até três casas decimais.",
  })
})
