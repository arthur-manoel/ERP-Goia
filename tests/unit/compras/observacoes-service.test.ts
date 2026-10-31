import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import {
  acaoCompra,
  criarCompra,
  receberCompra,
} from "@/modules/compras/compras.service"
import {
  ComprasError,
  type Contexto,
} from "@/modules/compras/compras.repository"
import { limiteObservacaoRecebimento } from "@/modules/compras/compras.regras"
import { receberCompraSchema } from "@/modules/compras/compras.schema"

const tx = vi.hoisted(() => ({
  compras: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  pedido_compra: { findFirst: vi.fn(), updateMany: vi.fn() },
  movimentacao_estoque: { findMany: vi.fn(), create: vi.fn() },
  estoque: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
  kardex: { create: vi.fn() },
}))

vi.mock("@/modules/compras/compras.repository", async (original) => {
  const actual =
    await original<typeof import("@/modules/compras/compras.repository")>()
  return {
    ...actual,
    gravacao: (_ctx: unknown, executar: (db: typeof tx) => unknown) =>
      executar(tx),
    exigirLocal: async () => {},
    auditar: async () => {},
  }
})

const ctx: Contexto = {
  idUsuario: 1,
  idEmpresa: 10,
  pode: { ler: true, criar: true, editar: true, excluir: true },
}
const chave = "12345678-1234-1234-1234-123456789012"

function compra() {
  return {
    id: 1,
    id_local_estoque: 1,
    codigo: "CP-000001",
    status: "EMITIDA",
    origem: "MANUAL",
    data_emissao: new Date("2026-10-28T12:00:00Z"),
    data_atualizacao: new Date("2026-10-28T12:00:00Z"),
    fornecedores: { id: 1, razao_social: "Fornecedor", nome_fantasia: null },
    usuarios: { id: 1, nome: "Usuário" },
    locais_estoque: { id: 1, nome: "Depósito" },
    pedido_compra: { id: 1, numero: "PC-000001", status: "EMITIDO" },
    observacao: null as string | null,
    _count: { nota_fiscal: 0 },
    nota_fiscal: [],
    compra_itens: [
      {
        id: 1,
        id_produto: 1,
        quantidade: new Prisma.Decimal(10),
        valor_unitario: new Prisma.Decimal(1),
        valor_total: new Prisma.Decimal(10),
        produtos: { codigo: "P1", nome: "Produto", unidade: "UN" },
      },
    ],
  }
}

function semGravacoes() {
  expect(tx.compras.update).not.toHaveBeenCalled()
  expect(tx.compras.updateMany).not.toHaveBeenCalled()
  expect(tx.compras.create).not.toHaveBeenCalled()
  expect(tx.movimentacao_estoque.create).not.toHaveBeenCalled()
  expect(tx.estoque.update).not.toHaveBeenCalled()
  expect(tx.estoque.create).not.toHaveBeenCalled()
}

beforeEach(() => {
  tx.movimentacao_estoque.findMany.mockResolvedValue([])
  tx.compras.findFirst.mockResolvedValue(compra())
})

describe("compras rejeitam observação composta antes da primeira escrita", () => {
  it("recebimento informa campo e limite e não altera estoque", async () => {
    const limite = limiteObservacaoRecebimento("CP-000001", chave)
    const operation = receberCompra(ctx, 1, {
      chaveIdempotencia: chave,
      observacao: "a".repeat(limite + 1),
    })
    await expect(operation).rejects.toBeInstanceOf(ComprasError)
    await expect(operation).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining(`use até ${limite} caracteres`),
    })
    semGravacoes()
  })

  it.each([-1, 0])(
    "recebimento preserva texto permitido junto à chave (%i do limite)",
    async (diferenca) => {
      const obs = "😀".repeat(
        limiteObservacaoRecebimento("CP-000001", chave) + diferenca,
      )
      tx.estoque.findFirst.mockResolvedValue({
        id: 1,
        id_setor: 1,
        quantidade: new Prisma.Decimal(0),
      })
      tx.movimentacao_estoque.create.mockResolvedValue({ id: 1 })
      tx.compras.updateMany.mockResolvedValue({ count: 1 })
      tx.pedido_compra.updateMany.mockResolvedValue({ count: 1 })
      await expect(
        receberCompra(
          ctx,
          1,
          receberCompraSchema.parse({
            chaveIdempotencia: chave,
            observacao: obs,
          }),
        ),
      ).resolves.toMatchObject({ chave, repetido: false })
      expect(tx.movimentacao_estoque.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          observacao: `Recebimento da compra CP-000001: ${obs} [rec:${chave}]`,
        }),
      })
    },
  )

  it("cancelamento não corta observação existente nem solta vínculo", async () => {
    tx.compras.findFirst.mockResolvedValue({
      ...compra(),
      observacao: "a".repeat(255),
    })
    await expect(acaoCompra(ctx, 1, "cancelar")).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Observação da compra"),
    })
    semGravacoes()
  })

  it("reaproveitamento de pedido legado não modifica a compra anterior com texto excedente", async () => {
    tx.pedido_compra.findFirst.mockResolvedValue({
      id: 1,
      numero: "PC-000001",
      status: "EMITIDO",
      compras: {
        id: 2,
        codigo: "CP-ANTIGA",
        status: "CANCELADA",
        observacao: "a".repeat(255),
      },
    })
    await expect(
      criarCompra(ctx, { idPedidoCompra: 1, idLocalEstoque: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("Observação da compra"),
    })
    semGravacoes()
  })

  it("mantém o replay idempotente de recebimento já registrado", async () => {
    tx.movimentacao_estoque.findMany.mockResolvedValue([
      {
        id: 1,
        id_produto: 1,
        quantidade: new Prisma.Decimal(1),
        observacao: `Recebimento anterior [rec:${chave}]`,
        data_movimentacao: new Date("2026-10-28T12:00:00Z"),
        usuarios: { id: 1, nome: "Usuário" },
        produtos: { codigo: "P1", nome: "Produto" },
      },
    ])
    await expect(
      receberCompra(ctx, 1, {
        chaveIdempotencia: chave,
        observacao: "a".repeat(255),
      }),
    ).resolves.toMatchObject({ repetido: true, chave })
    semGravacoes()
  })
})
