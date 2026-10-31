import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { prepararSaldoEstoque } from "@/modules/estoque/estoque.livro"

const d = (v: string | number) => new Prisma.Decimal(v)
const ctx = { idEmpresa: 10, idUsuario: 1 }
const pos = { idProduto: 1, idLocalEstoque: 2, idSetor: 3 }
const tx = {
  movimentacao_estoque: {
    groupBy: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  kardex: { create: vi.fn() },
  auditoria: { create: vi.fn() },
}
const client = tx as unknown as Prisma.TransactionClient
function recebimento() {
  return {
    id: 20,
    id_setor: 3,
    tipo: "ENTRADA_NF",
    origem_tipo: "COMPRA_RECEBIMENTO",
    quantidade: d(5),
    data_movimentacao: new Date("2026-10-01T12:00:00Z"),
    kardex: {
      id_empresa: 10,
      id_produto: 1,
      id_local_estoque: 2,
      id_setor: 3,
      tipo_movimentacao: "ENTRADA",
      quantidade: d(5),
      saldo_anterior: d(10),
      saldo_atual: d(15),
    },
  }
}
beforeEach(() => {
  tx.movimentacao_estoque.groupBy.mockResolvedValue([
    {
      tipo: "ENTRADA_NF",
      _sum: { quantidade: d(5) },
      _count: { _all: 1 },
    },
  ])
  tx.movimentacao_estoque.findMany.mockResolvedValue([recebimento()])
  tx.movimentacao_estoque.create.mockResolvedValue({ id: 21 })
})

it("a abertura comprovada tem data anterior à compra e auditoria com os IDs de evidência", async () => {
  const result = await prepararSaldoEstoque(client, ctx, pos, {
    quantidade: d(15),
  })
  expect(result.saldo.toFixed(3)).toBe("15.000")
  expect(result.idMovimentacaoAbertura).toBe(21)
  expect(tx.movimentacao_estoque.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      quantidade: d(10),
      origem_tipo: "SALDO_INICIAL",
      data_movimentacao: new Date("2026-10-01T11:59:59Z"),
    }),
  })
  const audit = JSON.parse(
    tx.auditoria.create.mock.calls[0][0].data.dados_novos,
  )
  expect(audit).toMatchObject({
    fundamento: "KARDEX_COMPRAS",
    idPrimeiroMovimento: 20,
    idUltimoMovimento: 20,
  })
})

it.each([
  ["sem kardex", () => [{ ...recebimento(), kardex: null }]],
  [
    "origem desconhecida",
    () => [{ ...recebimento(), origem_tipo: "OUTRA_ORIGEM" }],
  ],
  [
    "empresa alheia no kardex",
    () => [
      { ...recebimento(), kardex: { ...recebimento().kardex, id_empresa: 99 } },
    ],
  ],
  [
    "local alheio no kardex",
    () => [
      {
        ...recebimento(),
        kardex: { ...recebimento().kardex, id_local_estoque: 99 },
      },
    ],
  ],
  ["setor alheio no movimento", () => [{ ...recebimento(), id_setor: 99 }]],
  [
    "quantidade diferente no kardex",
    () => [
      {
        ...recebimento(),
        kardex: { ...recebimento().kardex, quantidade: d(4) },
      },
    ],
  ],
  [
    "saldo final incorreto",
    () => [
      {
        ...recebimento(),
        kardex: { ...recebimento().kardex, saldo_atual: d(14) },
      },
    ],
  ],
  [
    "abertura já existente",
    () => [
      {
        ...recebimento(),
        tipo: "AJUSTE_ENTRADA",
        origem_tipo: "SALDO_INICIAL",
      },
    ],
  ],
  [
    "data inválida",
    () => [{ ...recebimento(), data_movimentacao: new Date("invalid") }],
  ],
] as const)(
  "não inventa saldo inicial: recusa %s sem escrever",
  async (_nome, registros) => {
    tx.movimentacao_estoque.findMany.mockResolvedValue(registros())
    await expect(
      prepararSaldoEstoque(client, ctx, pos, { quantidade: d(15) }),
    ).rejects.toMatchObject({ status: 409 })
    expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
    expect(tx.kardex.create).not.toHaveBeenCalled()
    expect(tx.auditoria.create).not.toHaveBeenCalled()
  },
)

it("exige a continuidade de todos os recebimentos, não apenas o último saldo", async () => {
  tx.movimentacao_estoque.groupBy.mockResolvedValue([
    {
      tipo: "ENTRADA_NF",
      _sum: { quantidade: d(10) },
      _count: { _all: 2 },
    },
  ])
  tx.movimentacao_estoque.findMany.mockResolvedValue([
    recebimento(),
    {
      ...recebimento(),
      id: 22,
      kardex: {
        ...recebimento().kardex,
        saldo_anterior: d(16),
        saldo_atual: d(21),
      },
    },
  ])
  await expect(
    prepararSaldoEstoque(client, ctx, pos, { quantidade: d(21) }),
  ).rejects.toMatchObject({ status: 409 })
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
})

it("não duplica abertura quando a posição já corresponde ao livro", async () => {
  await prepararSaldoEstoque(client, ctx, pos, { quantidade: d(15) })
  tx.movimentacao_estoque.groupBy.mockResolvedValue([
    { tipo: "ENTRADA_NF", _sum: { quantidade: d(5) }, _count: { _all: 1 } },
    {
      tipo: "AJUSTE_ENTRADA",
      _sum: { quantidade: d(10) },
      _count: { _all: 1 },
    },
  ])
  const result = await prepararSaldoEstoque(client, ctx, pos, {
    quantidade: d(15),
  })
  expect(result.idMovimentacaoAbertura).toBeNull()
  expect(tx.movimentacao_estoque.create).toHaveBeenCalledTimes(1)
})

it("abre o legado sem movimentos e não altera a projeção por conta própria", async () => {
  tx.movimentacao_estoque.groupBy.mockResolvedValue([])
  const result = await prepararSaldoEstoque(client, ctx, pos, {
    quantidade: d(10),
  })
  expect(result.saldo.toFixed(3)).toBe("10.000")
  expect(tx.movimentacao_estoque.findMany).not.toHaveBeenCalled()
  expect(tx.movimentacao_estoque.create).toHaveBeenCalledTimes(1)
})

it("recusa saldo legado negativo sem produzir abertura", async () => {
  tx.movimentacao_estoque.groupBy.mockResolvedValue([])
  await expect(
    prepararSaldoEstoque(client, ctx, pos, { quantidade: d(-1) }),
  ).rejects.toMatchObject({ status: 409 })
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
})
