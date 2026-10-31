import "server-only"
import { Prisma, type ordem_producao } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import {
  ProducaoError,
  transacao,
  type Contexto,
  type Transaction,
} from "./producao.repository"
import type { OrdemFilters, Pagination } from "./ordem.schema"
export type Header = ordem_producao
export const counts = {
  _count: {
    select: {
      ordem_producao_item: true,
      ordem_producao_fluxo_setor: true,
      ordem_producao_movimentacao_setor: true,
      compras: true,
      pedido_compra: true,
      reserva_estoque: true,
      consumo_producao: true,
      necessidade_producao: true,
    },
  },
} satisfies Prisma.ordem_producaoInclude
export function write<T>(
  ctx: Contexto,
  operation: (tx: Transaction) => Promise<T>,
) {
  return transacao(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: number }>
    >`SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} AND status = 'ATIVA' FOR UPDATE`
    if (!rows.length)
      throw new ProducaoError(403, "Empresa não autorizada ou inativa.")
    return operation(tx)
  })
}
function whereFor(
  ctx: Contexto,
  filters: OrdemFilters,
): Prisma.ordem_producaoWhereInput {
  const {
    ordenar_por: _order,
    ordem: _direction,
    busca,
    data_inicio_de,
    data_inicio_ate,
    data_previsao_de,
    data_previsao_ate,
    data_conclusao_de,
    data_conclusao_ate,
    numero,
    ...ids
  } = filters
  void _order
  void _direction
  return {
    AND: [
      { id_empresa: ctx.idEmpresa },
      { ...ids, numero: numero ? { contains: numero } : undefined },
      ...(busca ? [{ numero: { contains: busca } }] : []),
      {
        data_inicio:
          data_inicio_de || data_inicio_ate
            ? { gte: data_inicio_de, lte: data_inicio_ate }
            : undefined,
        data_previsao:
          data_previsao_de || data_previsao_ate
            ? { gte: data_previsao_de, lte: data_previsao_ate }
            : undefined,
        data_conclusao:
          data_conclusao_de || data_conclusao_ate
            ? { gte: data_conclusao_de, lte: data_conclusao_ate }
            : undefined,
      },
    ],
  }
}
export function create(
  ctx: Contexto,
  data: Omit<
    Prisma.ordem_producaoUncheckedCreateInput,
    "id_empresa" | "id_usuario"
  >,
  tx: Transaction,
) {
  return tx.ordem_producao.create({
    data: { ...data, id_empresa: ctx.idEmpresa, id_usuario: ctx.idUsuario },
  })
}
export async function findAll(
  ctx: Contexto,
  filters: OrdemFilters,
  { page, limit }: Pagination,
) {
  const where = whereFor(ctx, filters)
  const orderBy: Prisma.ordem_producaoOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.ordem_producao.findMany({
        where,
        include: counts,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.ordem_producao.count({ where }),
    ],
    { isolationLevel: "RepeatableRead" },
  )
  return { rows, count }
}
export function count(ctx: Contexto, filters: OrdemFilters) {
  return prisma.ordem_producao.count({ where: whereFor(ctx, filters) })
}
export function findById(ctx: Contexto, id: number, tx: Transaction = prisma) {
  return tx.ordem_producao.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: counts,
  })
}
export async function lock(ctx: Contexto, id: number, tx: Transaction) {
  const rows = await tx.$queryRaw<
    Array<{ id: number }>
  >`SELECT id FROM ordem_producao WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa} FOR UPDATE`
  return rows.length ? findById(ctx, id, tx) : null
}
export function findByNumero(ctx: Contexto, numero: string, tx: Transaction) {
  return tx.ordem_producao.findFirst({
    where: { id_empresa: ctx.idEmpresa, numero },
    select: { id: true },
  })
}
export function update(
  ctx: Contexto,
  id: number,
  data: Prisma.ordem_producaoUncheckedUpdateInput,
  tx: Transaction,
) {
  return tx.ordem_producao.update({
    where: { id, id_empresa: ctx.idEmpresa },
    data,
  })
}
export const patch = update
export function cancel(ctx: Contexto, row: Header, tx: Transaction) {
  return transition(ctx, row, { status: "CANCELADA" }, tx)
}
export function transition(
  ctx: Contexto,
  row: Header,
  data: Prisma.ordem_producaoUncheckedUpdateManyInput,
  tx: Transaction,
) {
  return tx.ordem_producao.updateMany({
    where: {
      id: row.id,
      id_empresa: ctx.idEmpresa,
      status: row.status,
      id_setor: row.id_setor,
    },
    data,
  })
}
export function responsible(ctx: Contexto, tx: Transaction) {
  return tx.usuario_empresa.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
    },
    select: { id: true },
  })
}
export function activeProducts(
  ctx: Contexto,
  ids: number[],
  production: boolean,
  tx: Transaction,
) {
  return tx.produto_empresa.count({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: { in: ids },
      status: "ATIVO",
      produtos: {
        status: "ATIVO",
        ...(production ? { permite_producao: true } : {}),
      },
    },
  })
}
export function local(ctx: Contexto, id: number, tx: Transaction) {
  return tx.locais_estoque.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true },
  })
}
export function sector(ctx: Contexto, id: number, tx: Transaction) {
  return tx.setores.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true },
  })
}
export function pedido(ctx: Contexto, id: number, tx: Transaction) {
  return tx.pedido_cliente.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    select: { id: true, status: true },
  })
}
export function operationalCounts(ctx: Contexto, id: number, tx: Transaction) {
  const parent = { ordem_producao: { id_empresa: ctx.idEmpresa } }
  return Promise.all([
    tx.reserva_estoque.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: "ATIVA",
      },
    }),
    tx.consumo_producao.count({ where: { id_ordem_producao: id, ...parent } }),
    tx.movimentacao_estoque.count({
      where: {
        id_empresa: ctx.idEmpresa,
        origem_id: id,
        origem_tipo: { in: ["ORDEM_PRODUCAO", "PRODUCAO", "CONSUMO_PRODUCAO"] },
      },
    }),
    tx.compras.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: { not: "CANCELADA" },
      },
    }),
    tx.pedido_compra.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: { not: "CANCELADO" },
      },
    }),
    tx.necessidade_producao.count({
      where: {
        id_ordem_producao: id,
        ...parent,
        OR: [
          { status: { not: "CANCELADA" } },
          { quantidade_consumida: { gt: 0 } },
          { quantidade_reservada: { gt: 0 } },
        ],
      },
    }),
    tx.ordem_producao_movimentacao_setor.count({
      where: { id_ordem_producao: id, ...parent },
    }),
    tx.ordem_producao_apontamento.count({
      where: { id_ordem_producao: id, ordem_producao_item: parent },
    }),
    tx.contas_pagar.count({
      where: {
        id_empresa: ctx.idEmpresa,
        compras: { id_ordem_producao: id, id_empresa: ctx.idEmpresa },
        OR: [
          { situacao: { not: "CANCELADO" } },
          { pagamentos_pagar: { some: {} } },
          { despesas: { some: { situacao: "PAGA" } } },
        ],
      },
    }),
    tx.ordem_producao_item.count({
      where: {
        id_ordem_producao: id,
        ...parent,
        quantidade_produzida: { gt: 0 },
      },
    }),
  ])
}
export async function conclusionBlockers(
  ctx: Contexto,
  id: number,
  tx: Transaction,
) {
  return Promise.all([
    tx.reserva_estoque.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: "ATIVA",
      },
    }),
    tx.necessidade_producao.count({
      where: {
        id_ordem_producao: id,
        ordem_producao: { id_empresa: ctx.idEmpresa },
        status: { notIn: ["CONSUMIDA", "CANCELADA"] },
      },
    }),
    tx.compras.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: { notIn: ["ENTREGUE", "CANCELADA"] },
      },
    }),
    tx.pedido_compra.count({
      where: {
        id_ordem_producao: id,
        id_empresa: ctx.idEmpresa,
        status: { notIn: ["RECEBIDO", "CANCELADO"] },
      },
    }),
    tx.consumo_producao.count({
      where: {
        id_ordem_producao: id,
        ordem_producao: { id_empresa: ctx.idEmpresa },
        OR: [
          { quantidade: { lte: 0 } },
          { data_consumo: null },
          { reserva_estoque: { id_empresa: { not: ctx.idEmpresa } } },
          { reserva_estoque: { id_ordem_producao: { not: id } } },
          { necessidade_producao: { id_ordem_producao: { not: id } } },
        ],
      },
    }),
  ])
}
export async function listItems(
  ctx: Contexto,
  id: number,
  { page, limit }: Pagination,
) {
  const where = {
    id_ordem_producao: id,
    ordem_producao: { id_empresa: ctx.idEmpresa },
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.ordem_producao_item.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: "asc" },
      }),
      prisma.ordem_producao_item.count({ where }),
    ],
    { isolationLevel: "RepeatableRead" },
  )
  return { rows, count }
}
export async function listStages(
  ctx: Contexto,
  id: number,
  { page, limit }: Pagination,
) {
  const where = {
    id_ordem_producao: id,
    ordem_producao: { id_empresa: ctx.idEmpresa },
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.ordem_producao_fluxo_setor.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ ordem: "asc" }, { id: "asc" }],
      }),
      prisma.ordem_producao_fluxo_setor.count({ where }),
    ],
    { isolationLevel: "RepeatableRead" },
  )
  return { rows, count }
}
export function item(
  ctx: Contexto,
  id: number,
  itemId: number,
  tx: Transaction,
) {
  return tx.ordem_producao_item.findFirst({
    where: {
      id: itemId,
      id_ordem_producao: id,
      ordem_producao: { id_empresa: ctx.idEmpresa },
    },
  })
}
export async function createItem(
  ctx: Contexto,
  id: number,
  data: { id_produto: number; quantidade: string; tamanho: string },
  tx: Transaction,
) {
  await assertParent(ctx, id, tx)
  return tx.ordem_producao_item.create({
    data: { ...data, id_ordem_producao: id },
  })
}
export async function createPlan(
  ctx: Contexto,
  id: number,
  itemId: number,
  rows: Array<{
    id_materia_prima: number
    quantidade_por_peca: Prisma.Decimal
    quantidade_necessaria: Prisma.Decimal
  }>,
  tx: Transaction,
) {
  await assertParent(ctx, id, tx)
  return tx.ordem_producao_consumo_planejado.createMany({
    data: rows.map((row) => ({
      ...row,
      id_ordem_producao: id,
      id_ordem_producao_item: itemId,
    })),
  })
}
export async function createStages(
  ctx: Contexto,
  id: number,
  setores: Array<{ id: number }>,
  tx: Transaction,
) {
  await assertParent(ctx, id, tx)
  return tx.ordem_producao_fluxo_setor.createMany({
    data: setores.map((setor, index) => ({
      id_ordem_producao: id,
      id_setor: setor.id,
      ordem: index + 1,
    })),
  })
}
export function produced(
  ctx: Contexto,
  id: number,
  itemId: number,
  expected: Prisma.Decimal,
  quantity: string,
  tx: Transaction,
) {
  return tx.ordem_producao_item.updateMany({
    where: {
      id: itemId,
      id_ordem_producao: id,
      quantidade_produzida: expected,
      ordem_producao: { id_empresa: ctx.idEmpresa },
    },
    data: { quantidade_produzida: quantity },
  })
}
export async function registerProduction(
  ctx: Contexto,
  id: number,
  itemId: number,
  setor: number,
  delta: Prisma.Decimal,
  tx: Transaction,
) {
  await assertParent(ctx, id, tx)
  return tx.ordem_producao_apontamento.create({
    data: {
      id_ordem_producao: id,
      id_ordem_producao_item: itemId,
      id_setor: setor,
      id_usuario: ctx.idUsuario,
      data_apontamento: new Date(),
      quantidade_produzida: delta,
    },
  })
}
export function updateItem(
  ctx: Contexto,
  id: number,
  itemId: number,
  data: { quantidade?: string; tamanho?: string },
  tx: Transaction,
) {
  return tx.ordem_producao_item.updateMany({
    where: {
      id: itemId,
      id_ordem_producao: id,
      ordem_producao: { id_empresa: ctx.idEmpresa },
    },
    data,
  })
}
export function deleteItem(
  ctx: Contexto,
  id: number,
  itemId: number,
  tx: Transaction,
) {
  return tx.ordem_producao_item.deleteMany({
    where: {
      id: itemId,
      id_ordem_producao: id,
      ordem_producao: { id_empresa: ctx.idEmpresa },
    },
  })
}
export function deletePlan(
  ctx: Contexto,
  id: number,
  itemId: number,
  tx: Transaction,
) {
  return tx.ordem_producao_consumo_planejado.deleteMany({
    where: {
      id_ordem_producao: id,
      id_ordem_producao_item: itemId,
      ordem_producao: { id_empresa: ctx.idEmpresa },
    },
  })
}

async function assertParent(ctx: Contexto, id: number, tx: Transaction) {
  if (
    !(await tx.ordem_producao.findFirst({
      where: { id, id_empresa: ctx.idEmpresa },
      select: { id: true },
    }))
  )
    throw new ProducaoError(404, "Ordem de produção não encontrada.")
}
