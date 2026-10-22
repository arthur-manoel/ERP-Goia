import {
  Prisma,
  type contas_receber as ContaReceber,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { ContaReceberFilters, Pagination } from "./schema"

export type { ContaReceber }

type PersistedFilters = Omit<
  ContaReceberFilters,
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
    ...(filters.id_venda === undefined ? {} : { id_venda: filters.id_venda }),
    ...(filters.situacao === undefined ? {} : { situacao: filters.situacao }),
    ...(vencimento === undefined ? {} : { data_vencimento: vencimento }),
    ...(lancamento === undefined ? {} : { data_lancamento: lancamento }),
    ...(filters.busca === undefined
      ? {}
      : { descricao: { contains: filters.busca } }),
  } satisfies Prisma.contas_receberWhereInput
}

export async function create(
  data: Prisma.contas_receberUncheckedCreateInput,
): Promise<ContaReceber> {
  return prisma.contas_receber.create({ data })
}

export async function findAll(
  filters: PersistedFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: ContaReceber[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy = [
    { [filters.ordenar_por]: filters.ordem },
    { id: "asc" },
  ] as Prisma.contas_receberOrderByWithRelationInput[]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.contas_receber.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.contas_receber.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export async function count(
  filters: PersistedFilters,
  companies: number[],
): Promise<number> {
  return prisma.contas_receber.count({ where: whereFor(filters, companies) })
}

export async function findById(
  id: number,
  companies: number[],
): Promise<ContaReceber | null> {
  return prisma.contas_receber.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

export async function findEmpresa(id: number) {
  return prisma.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export async function findVenda(id: number, idEmpresa: number) {
  return prisma.venda.findFirst({ where: { id, id_empresa: idEmpresa } })
}

export async function findCategoria(id: number, idEmpresa: number) {
  return prisma.categoria_financeira.findFirst({
    where: {
      id,
      id_empresa: idEmpresa,
      status: "ATIVA",
      tipo: { in: ["RECEITA", "AMBOS"] },
    },
  })
}

async function write(
  id: number,
  data: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  expected: ContaReceber,
): Promise<ContaReceber | null> {
  try {
    return await prisma.contas_receber.update({
      // O banco armazena data_atualizacao com precisão de segundos. Por isso,
      // além dela, a escrita compara cada campo mutável lido antes do cálculo.
      // Isso cria uma comparação e troca atômica inclusive para duas edições
      // de valores dentro do mesmo segundo.
      where: {
        id,
        id_empresa: { in: companies },
        id_venda: expected.id_venda,
        id_categoria: expected.id_categoria,
        numero_parcela: expected.numero_parcela,
        total_parcelas: expected.total_parcelas,
        descricao: expected.descricao,
        data_vencimento: expected.data_vencimento,
        valor_original: expected.valor_original,
        valor_desconto: expected.valor_desconto,
        valor_acrescimo: expected.valor_acrescimo,
        valor_final: expected.valor_final,
        situacao: expected.situacao,
        observacao: expected.observacao,
        data_atualizacao: expected.data_atualizacao,
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
  data: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  expected: ContaReceber,
) {
  return write(id, data, companies, expected)
}

export function patch(
  id: number,
  data: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  expected: ContaReceber,
) {
  return write(id, data, companies, expected)
}

export async function cancel(
  id: number,
  companies: number[],
  expected: ContaReceber,
): Promise<boolean> {
  return (
    (await write(id, { situacao: "CANCELADO" }, companies, expected)) !== null
  )
}
