import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import { db } from "../../helpers/prisma"
import {
  consultarSaldo,
  movimentar,
} from "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository"

vi.mock("server-only", () => ({}))
const tx = {
  $queryRaw: vi.fn(),
  produto_empresa: { findFirst: vi.fn() },
  locais_estoque: { findFirst: vi.fn() },
  setores: { findFirst: vi.fn() },
  estoque: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  estoque_variacao: { aggregate: vi.fn() },
  movimentacao_estoque: { groupBy: vi.fn(), create: vi.fn() },
  kardex: { create: vi.fn() },
  auditoria: { create: vi.fn() },
}
const ctx = { idUsuario: 5, idEmpresa: 10 }
const dados = {
  idProduto: 1,
  idLocalEstoque: 2,
  idSetor: 3,
  quantidade: "2.000",
  observacao: "Consumo",
}
const estoque = {
  id: 4,
  id_setor: 3,
  quantidade: new Prisma.Decimal(10),
  quantidade_reservada: new Prisma.Decimal(1),
}
beforeEach(() => {
  tx.estoque_variacao.aggregate.mockResolvedValue({
    _sum: { quantidade: null },
  })
  db.$transaction.mockImplementation(async (run) => run(tx))
  tx.$queryRaw.mockResolvedValue([{ id: 1 }])
  tx.produto_empresa.findFirst.mockResolvedValue({ id: 1 })
  tx.locais_estoque.findFirst.mockResolvedValue({ id: 2 })
  tx.setores.findFirst.mockResolvedValue({ id: 3 })
  tx.estoque.findUnique.mockResolvedValue(estoque)
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
it("bloqueia chave parametrizada antes das leituras e mantém todos os registros na mesma transação", async () => {
  expect((await movimentar(ctx, dados, "saida")).saldoAtual).toBe("8.000")
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
    maxWait: 10000,
    timeout: 15000,
  })
  const [strings, ...values] = tx.$queryRaw.mock.calls[0]
  expect(strings.join("?")).toContain("FOR UPDATE")
  expect(values).toEqual([10, 1])
  expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    tx.estoque.findUnique.mock.invocationCallOrder[0],
  )
  expect(tx.estoque.updateMany).toHaveBeenCalledWith({
    where: { id: 4, id_empresa: 10, quantidade: new Prisma.Decimal(10) },
    data: {
      quantidade: new Prisma.Decimal(8),
      data_atualizacao: expect.any(Date),
    },
  })
  expect(tx.movimentacao_estoque.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      tipo: "AJUSTE_SAIDA",
      quantidade: new Prisma.Decimal(2),
      id_usuario: 5,
      origem_tipo: "API_SAIDA",
    }),
  })
  expect(tx.kardex.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id_movimentacao: 7,
      saldo_anterior: new Prisma.Decimal(10),
      saldo_atual: new Prisma.Decimal(8),
    }),
  })
  expect(tx.auditoria.create).toHaveBeenCalledTimes(1)
})
it("propaga falha de auditoria para o rollback em vez de retornar sucesso parcial", async () => {
  tx.auditoria.create.mockRejectedValue(new Error("auditoria indisponível"))
  await expect(movimentar(ctx, dados, "saida")).rejects.toThrow(
    "auditoria indisponível",
  )
})
it("UPDATE condicionado sem linha afetada não cria movimento nem auditoria", async () => {
  tx.estoque.updateMany.mockResolvedValue({ count: 0 })
  await expect(movimentar(ctx, dados, "saida")).rejects.toMatchObject({
    status: 409,
  })
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
  expect(tx.auditoria.create).not.toHaveBeenCalled()
})
it.each(["P2002", "P2003", "P2028", "P2034"])(
  "transforma conflito %s em 409 sem repetição automática",
  async (code) => {
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("conflito", {
        code,
        clientVersion: "7.10.0",
      }),
    )
    await expect(movimentar(ctx, dados, "saida")).rejects.toMatchObject({
      status: 409,
    })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  },
)
it("consulta soma os oito tipos no snapshot e filtra empresa/local/produto", async () => {
  tx.movimentacao_estoque.groupBy.mockResolvedValue(
    [
      "ENTRADA_NF",
      "ENTRADA_PRODUCAO",
      "AJUSTE_ENTRADA",
      "TRANSFERENCIA_ENTRADA",
      "SAIDA_VENDA",
      "SAIDA_PRODUCAO",
      "AJUSTE_SAIDA",
      "TRANSFERENCIA_SAIDA",
    ].map((tipo, i) => ({
      tipo,
      _sum: { quantidade: new Prisma.Decimal(i < 4 ? "1.001" : "0.001") },
      _count: { _all: 1 },
    })),
  )
  expect((await consultarSaldo(ctx, dados)).saldo).toBe("4.000")
  expect(tx.movimentacao_estoque.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id_empresa: 10, id_local_estoque: 2, id_produto: 1 },
    }),
  )
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  })
  expect(tx.$queryRaw).not.toHaveBeenCalled()
  expect(tx.estoque.updateMany).not.toHaveBeenCalled()
})
