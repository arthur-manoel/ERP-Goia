import { beforeEach, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import {
  exigirFornecedor,
  fornecedorDaEmpresa,
  type Contexto,
} from "@/modules/compras/compras.repository"
import {
  criarCompra,
  acaoPedido,
  listarOpcoes,
} from "@/modules/compras/compras.service"
import { opcoesSchema } from "@/modules/compras/compras.schema"
import { db } from "../../helpers/prisma"
const ctx: Contexto = {
  idEmpresa: 10,
  idUsuario: 1,
  pode: { ler: true, criar: true, editar: true, excluir: true },
}
const decimal = (v: string | number) => new Prisma.Decimal(v)
const supplier = {
  id: 50,
  id_empresa: null,
  razao_social: "Fornecedor",
  nome_fantasia: null,
  cnpj: "12345678000190",
  empresa_fornecedor: [
    { prazo_pagamento: 30, prazo_entrega: 5, observacao: "Boleto" },
  ],
}
const pedido = {
  id: 5,
  id_empresa: 10,
  id_fornecedor: 50,
  id_ordem_producao: null,
  numero: "PC-1",
  status: "EMITIDO",
  data_pedido: new Date(),
  observacao: null,
  compras: null,
  requisicao_compra: null,
  fornecedores: supplier,
  usuarios: { id: 1, nome: "Usuário" },
  _count: { nota_fiscal: 0 },
  item_pedido_compra: [
    {
      id: 8,
      id_produto: 3,
      quantidade: decimal(1),
      valor_unitario: decimal(10),
      valor_total: decimal(10),
      produtos: { nome: "Tecido", codigo: "T1", unidade: "M" },
    },
  ],
}
beforeEach(() => {
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.locais_estoque.findFirst.mockResolvedValue({ id: 1 })
  db.pedido_compra.findFirst.mockResolvedValue(pedido)
})
it("consulta de disponibilidade exige global nulo associado OU fornecedor próprio", () => {
  expect(fornecedorDaEmpresa(10)).toEqual({
    status: "ATIVO",
    OR: [
      { id_empresa: 10 },
      {
        id_empresa: null,
        empresa_fornecedor: { some: { id_empresa: 10, status: "ATIVO" } },
      },
    ],
  })
})
it.each([
  "global sem associação",
  "associação inativa",
  "fornecedor específico de outra empresa",
])("não permite %s em novas compras", async () => {
  db.fornecedores.findFirst.mockResolvedValue(null)
  await expect(
    exigirFornecedor(db as unknown as Prisma.TransactionClient, ctx, 50),
  ).rejects.toMatchObject({ status: 400 })
  expect(db.fornecedores.findFirst).toHaveBeenCalledWith({
    where: { id: 50, ...fornecedorDaEmpresa(10) },
    select: { id: true },
  })
})
it.each(["específico da empresa", "global com associação ativa"])(
  "permite fornecedor %s",
  async () => {
    db.fornecedores.findFirst.mockResolvedValue({ id: 50 })
    await expect(
      exigirFornecedor(db as unknown as Prisma.TransactionClient, ctx, 50),
    ).resolves.toBeUndefined()
  },
)
it("conversão de pedido antigo revalida o fornecedor antes de gravar a compra", async () => {
  db.fornecedores.findFirst.mockResolvedValue(null)
  await expect(
    criarCompra(ctx, { idPedidoCompra: 5, idLocalEstoque: 1 }),
  ).rejects.toMatchObject({ status: 400 })
  expect(db.compras.create).not.toHaveBeenCalled()
  expect(db.fornecedores.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 50, ...fornecedorDaEmpresa(10) } }),
  )
})
it("emissão do pedido revalida associação inativada desde o cadastro", async () => {
  db.pedido_compra.findFirst.mockResolvedValue({
    ...pedido,
    status: "RASCUNHO",
  })
  db.fornecedores.findFirst.mockResolvedValue(null)
  await expect(acaoPedido(ctx, 5, "emitir")).rejects.toMatchObject({
    status: 400,
  })
  expect(db.pedido_compra.updateMany).not.toHaveBeenCalled()
})
it("seletor de compras aplica escopo, paginação e devolve somente condições da empresa ativa", async () => {
  db.fornecedores.findMany.mockResolvedValue([supplier])
  db.fornecedores.count.mockResolvedValue(1)
  const result = await listarOpcoes(
    ctx,
    opcoesSchema.parse({
      tipo: "fornecedores",
      busca: "Tecido",
      pagina: 2,
      limite: 10,
    }),
  )
  expect(result.opcoes).toEqual([
    expect.objectContaining({
      tipoFornecedor: "GLOBAL_ASSOCIADO",
      condicoesComerciais: {
        prazo_pagamento: 30,
        prazo_entrega: 5,
        observacao: "Boleto",
      },
    }),
  ])
  expect(db.fornecedores.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 10,
      take: 10,
      where: { AND: expect.arrayContaining([fornecedorDaEmpresa(10)]) },
      select: expect.objectContaining({
        empresa_fornecedor: {
          where: { id_empresa: 10, status: "ATIVO" },
          select: {
            prazo_pagamento: true,
            prazo_entrega: true,
            observacao: true,
          },
        },
      }),
    }),
  )
  expect(db.compras.update).not.toHaveBeenCalled()
  expect(db.compras.updateMany).not.toHaveBeenCalled()
})
