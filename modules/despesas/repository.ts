import {
  Prisma,
  type despesas as Despesa,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { DespesaFilters, Pagination } from "./schema"

export type { Despesa }
type PersistedFilters = Omit<DespesaFilters, "page" | "limit">

function dateFilter(
  exact: Date | undefined,
  initial: Date | undefined,
  final: Date | undefined,
) {
  if (exact) return exact
  if (initial || final)
    return {
      ...(initial ? { gte: initial } : {}),
      ...(final ? { lte: final } : {}),
    }
  return undefined
}

function whereFor(filters: PersistedFilters, companies: number[]) {
  const dataDespesa = dateFilter(
    filters.data_despesa,
    filters.data_despesa_inicio,
    filters.data_despesa_fim,
  )
  const dataCadastro = dateFilter(
    undefined,
    filters.data_cadastro_inicio,
    filters.data_cadastro_fim,
  )
  return {
    id_empresa: { in: companies },
    ...(filters.id_empresa === undefined
      ? {}
      : { id_empresa: filters.id_empresa }),
    ...(filters.id_categoria === undefined
      ? {}
      : { id_categoria: filters.id_categoria }),
    ...(filters.situacao === undefined ? {} : { situacao: filters.situacao }),
    ...(dataDespesa === undefined ? {} : { data_despesa: dataDespesa }),
    ...(dataCadastro === undefined ? {} : { data_cadastro: dataCadastro }),
    ...(filters.busca === undefined
      ? {}
      : { descricao: { contains: filters.busca } }),
  } satisfies Prisma.despesasWhereInput
}

export async function create(
  data: Prisma.despesasUncheckedCreateInput,
): Promise<Despesa> {
  return prisma.despesas.create({ data })
}

export async function findAll(
  filters: PersistedFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: Despesa[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy = [
    { [filters.ordenar_por]: filters.ordem },
    { id: "asc" },
  ] as Prisma.despesasOrderByWithRelationInput[]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.despesas.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.despesas.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export function count(filters: PersistedFilters, companies: number[]) {
  return prisma.despesas.count({ where: whereFor(filters, companies) })
}

export function findById(
  id: number,
  companies: number[],
): Promise<Despesa | null> {
  return prisma.despesas.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

export function findEmpresa(id: number) {
  return prisma.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export function findCategoria(id: number, idEmpresa: number) {
  return prisma.categoria_financeira.findFirst({
    where: {
      id,
      id_empresa: idEmpresa,
      status: "ATIVA",
      tipo: { in: ["DESPESA", "AMBOS"] },
    },
  })
}

export function findContaPagar(id: number, idEmpresa: number) {
  return prisma.contas_pagar.findFirst({
    where: { id, id_empresa: idEmpresa, situacao: { not: "CANCELADO" } },
  })
}

async function write(
  id: number,
  data: Prisma.despesasUncheckedUpdateInput,
  companies: number[],
): Promise<Despesa | null> {
  try {
    return await prisma.despesas.update({
      where: { id, id_empresa: { in: companies } },
      data,
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return null
    throw error
  }
}

export function update(
  id: number,
  data: Prisma.despesasUncheckedUpdateInput,
  companies: number[],
) {
  return write(id, data, companies)
}

export function patch(
  id: number,
  data: Prisma.despesasUncheckedUpdateInput,
  companies: number[],
) {
  return write(id, data, companies)
}

export async function cancel(id: number, companies: number[]) {
  return (await write(id, { situacao: "CANCELADA" }, companies)) !== null
}
