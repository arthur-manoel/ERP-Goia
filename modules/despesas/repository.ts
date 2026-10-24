import {
  Prisma,
  type despesas as Despesa,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { DespesaFilters, Pagination } from "./schema"
export type { Despesa }
export type Database = Prisma.TransactionClient
export {
  withWriteLock,
  findEmpresa,
  findCategoria,
} from "../contas_pagar/repository"
export { auditFinancial } from "../financeiro/auditoria"

function whereFor(
  filters: DespesaFilters,
  companies: number[],
): Prisma.despesasWhereInput {
  const end =
    filters.data_cadastro_fim &&
    new Date(filters.data_cadastro_fim.getTime() + 86_400_000)
  return {
    AND: [
      { id_empresa: { in: companies } },
      ...(filters.id_empresa === undefined
        ? []
        : [{ id_empresa: filters.id_empresa }]),
      ...(filters.id_categoria === undefined
        ? []
        : [{ id_categoria: filters.id_categoria }]),
      ...(filters.id_conta_pagar === undefined
        ? []
        : [{ id_conta_pagar: filters.id_conta_pagar }]),
      ...(filters.situacao === undefined
        ? []
        : [{ situacao: filters.situacao }]),
      ...(filters.data_despesa ? [{ data_despesa: filters.data_despesa }] : []),
      ...(filters.data_despesa_inicio || filters.data_despesa_fim
        ? [
            {
              data_despesa: {
                ...(filters.data_despesa_inicio
                  ? { gte: filters.data_despesa_inicio }
                  : {}),
                ...(filters.data_despesa_fim
                  ? { lte: filters.data_despesa_fim }
                  : {}),
              },
            },
          ]
        : []),
      ...(filters.data_cadastro_inicio || end
        ? [
            {
              data_cadastro: {
                ...(filters.data_cadastro_inicio
                  ? { gte: filters.data_cadastro_inicio }
                  : {}),
                ...(end ? { lt: end } : {}),
              },
            },
          ]
        : []),
      ...(filters.descricao
        ? [{ descricao: { contains: filters.descricao } }]
        : []),
      ...(filters.busca ? [{ descricao: { contains: filters.busca } }] : []),
    ],
  }
}
export function create(
  data: Prisma.despesasUncheckedCreateInput,
  database: Database,
): Promise<Despesa> {
  return database.despesas.create({ data })
}
export async function findAll(
  filters: DespesaFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: Despesa[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy: Prisma.despesasOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    { id: "asc" },
  ]
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
export function count(
  filters: DespesaFilters,
  companies: number[],
): Promise<number> {
  return prisma.despesas.count({ where: whereFor(filters, companies) })
}
export function findById(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<Despesa | null> {
  return database.despesas.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}
export async function findForUpdate(
  id: number,
  companies: number[],
  database: Database,
): Promise<Despesa | null> {
  const rows = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM despesas WHERE id = ${id} AND id_empresa IN (${Prisma.join(companies)}) FOR UPDATE
  `
  return rows.length ? findById(id, companies, database) : null
}
export async function findContaPagar(
  id: number,
  idEmpresa: number,
  database: Database,
) {
  const rows = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM contas_pagar WHERE id = ${id} AND id_empresa = ${idEmpresa} FOR UPDATE
  `
  if (!rows.length) return null
  return database.contas_pagar.findFirst({
    where: { id, id_empresa: idEmpresa },
  })
}
export function countMovements(
  id: number,
  database: Database,
): Promise<number> {
  return database.movimentacoes_financeiras.count({ where: { id_despesa: id } })
}
export function update(
  id: number,
  data: Prisma.despesasUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<Despesa> {
  return database.despesas.update({
    where: { id, id_empresa: { in: companies } },
    data: { ...data, data_atualizacao: new Date() },
  })
}
export function patch(
  id: number,
  data: Prisma.despesasUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<Despesa> {
  return update(id, data, companies, database)
}
export function cancel(
  id: number,
  companies: number[],
  database: Database,
): Promise<Despesa> {
  return update(id, { situacao: "CANCELADA" }, companies, database)
}
