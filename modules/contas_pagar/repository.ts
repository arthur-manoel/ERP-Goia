import {
  Prisma,
  type contas_pagar as ContaPagar,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { ContaPagarFilters, Pagination } from "./schema"

export type { ContaPagar }

type PersistedFilters = Omit<
  ContaPagarFilters,
  "page" | "limit" | "situacao"
> & {
  situacao?: "ABERTO" | "PAGO" | "PARCIAL" | "ATRASADO" | "CANCELADO"
}

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
  const vencimento = dateFilter(
    filters.data_vencimento,
    filters.data_vencimento_inicio,
    filters.data_vencimento_fim,
  )
  const lancamento = dateFilter(
    undefined,
    filters.data_lancamento_inicio,
    filters.data_lancamento_fim,
  )
  return {
    id_empresa: { in: companies },
    ...(filters.id_empresa === undefined
      ? {}
      : { id_empresa: filters.id_empresa }),
    ...(filters.id_categoria === undefined
      ? {}
      : { id_categoria: filters.id_categoria }),
    ...(filters.id_compra === undefined
      ? {}
      : { id_compra: filters.id_compra }),
    ...(filters.situacao === undefined ? {} : { situacao: filters.situacao }),
    ...(vencimento === undefined ? {} : { data_vencimento: vencimento }),
    ...(lancamento === undefined ? {} : { data_lancamento: lancamento }),
    ...(filters.busca === undefined
      ? {}
      : { descricao: { contains: filters.busca } }),
  } satisfies Prisma.contas_pagarWhereInput
}

export async function create(
  data: Prisma.contas_pagarUncheckedCreateInput,
): Promise<ContaPagar> {
  return prisma.contas_pagar.create({ data })
}

export async function findAll(
  filters: PersistedFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: ContaPagar[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy = [
    { [filters.ordenar_por]: filters.ordem },
    { id: "asc" },
  ] as Prisma.contas_pagarOrderByWithRelationInput[]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.contas_pagar.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contas_pagar.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export async function count(
  filters: PersistedFilters,
  companies: number[],
): Promise<number> {
  return prisma.contas_pagar.count({ where: whereFor(filters, companies) })
}

export async function findById(
  id: number,
  companies: number[],
): Promise<ContaPagar | null> {
  return prisma.contas_pagar.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

export async function findEmpresa(id: number) {
  return prisma.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export async function findCompra(id: number, idEmpresa: number) {
  return prisma.compras.findFirst({ where: { id, id_empresa: idEmpresa } })
}

export async function findCategoria(id: number, idEmpresa: number) {
  return prisma.categoria_financeira.findFirst({
    where: {
      id,
      id_empresa: idEmpresa,
      status: "ATIVA",
      tipo: { in: ["DESPESA", "AMBOS"] },
    },
  })
}

async function write(
  id: number,
  data: Prisma.contas_pagarUncheckedUpdateInput,
  companies: number[],
): Promise<ContaPagar | null> {
  try {
    return await prisma.contas_pagar.update({
      // The state predicate makes the read/validate/write flow safe against a
      // concurrent payment or cancellation. A P2025 is translated to null so
      // the service can distinguish a lost race from a missing account.
      where: {
        id,
        id_empresa: { in: companies },
        situacao: { notIn: ["PAGO", "CANCELADO"] },
      },
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
  data: Prisma.contas_pagarUncheckedUpdateInput,
  companies: number[],
) {
  return write(id, data, companies)
}

export function patch(
  id: number,
  data: Prisma.contas_pagarUncheckedUpdateInput,
  companies: number[],
) {
  return write(id, data, companies)
}

export async function cancel(
  id: number,
  companies: number[],
): Promise<boolean> {
  return (await write(id, { situacao: "CANCELADO" }, companies)) !== null
}
