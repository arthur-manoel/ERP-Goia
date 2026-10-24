import {
  Prisma,
  type contas_pagar as ContaPagar,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { ValidationError } from "../../src/lib/api/errors"
import type { ContaPagarFilters, Pagination } from "./schema"

export type { ContaPagar }
export type Database = Prisma.TransactionClient
export { auditFinancial } from "../financeiro/auditoria"

export function withWriteLock<T>(
  companies: number[],
  operation: (database: Database) => Promise<T>,
) {
  return prisma.$transaction(
    async (database) => {
      const ids = [...new Set(companies)].sort((a, b) => a - b)
      if (!ids.length)
        throw new ValidationError("Empresa inexistente ou inativa.")
      const rows = await database.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM empresas WHERE id IN (${Prisma.join(ids)}) AND status = 'ATIVA'
      ORDER BY id FOR UPDATE
    `
      if (rows.length !== ids.length)
        throw new ValidationError("Empresa inexistente ou inativa.")
      return operation(database)
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15000,
    },
  )
}

function whereFor(
  filters: ContaPagarFilters,
  companies: number[],
): Prisma.contas_pagarWhereInput {
  const lancamentoFim =
    filters.data_lancamento_fim &&
    new Date(filters.data_lancamento_fim.getTime() + 86_400_000)
  return {
    AND: [
      { id_empresa: { in: companies } },
      ...(filters.id_empresa === undefined
        ? []
        : [{ id_empresa: filters.id_empresa }]),
      ...(filters.id_compra === undefined
        ? []
        : [{ id_compra: filters.id_compra }]),
      ...(filters.id_categoria === undefined
        ? []
        : [{ id_categoria: filters.id_categoria }]),
      ...(filters.situacao === undefined
        ? []
        : [{ situacao: filters.situacao }]),
      ...(filters.data_vencimento
        ? [{ data_vencimento: filters.data_vencimento }]
        : []),
      ...(filters.data_vencimento_inicio || filters.data_vencimento_fim
        ? [
            {
              data_vencimento: {
                ...(filters.data_vencimento_inicio
                  ? { gte: filters.data_vencimento_inicio }
                  : {}),
                ...(filters.data_vencimento_fim
                  ? { lte: filters.data_vencimento_fim }
                  : {}),
              },
            },
          ]
        : []),
      ...(filters.data_lancamento_inicio || lancamentoFim
        ? [
            {
              data_lancamento: {
                ...(filters.data_lancamento_inicio
                  ? { gte: filters.data_lancamento_inicio }
                  : {}),
                ...(lancamentoFim ? { lt: lancamentoFim } : {}),
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
  data: Prisma.contas_pagarUncheckedCreateInput,
  database: Database,
): Promise<ContaPagar> {
  return database.contas_pagar.create({ data })
}

export async function findAll(
  filters: ContaPagarFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: ContaPagar[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy: Prisma.contas_pagarOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
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

export function count(
  filters: ContaPagarFilters,
  companies: number[],
): Promise<number> {
  return prisma.contas_pagar.count({ where: whereFor(filters, companies) })
}

export function findById(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<ContaPagar | null> {
  return database.contas_pagar.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

/** A releitura acontece somente após o bloqueio da linha, no mesmo cliente
 * transacional usado para validar, recalcular e gravar os valores.
 */
export async function findForUpdate(
  id: number,
  companies: number[],
  database: Database,
): Promise<ContaPagar | null> {
  const locked = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM contas_pagar
    WHERE id = ${id} AND id_empresa IN (${Prisma.join(companies)}) FOR UPDATE
  `
  if (!locked.length) return null
  return findById(id, companies, database)
}

export function findEmpresa(id: number, database: Database) {
  return database.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export function findCompra(id: number, idEmpresa: number, database: Database) {
  return database.compras.findFirst({ where: { id, id_empresa: idEmpresa } })
}

export function findCategoria(
  id: number,
  idEmpresa: number,
  database: Database,
) {
  return database.categoria_financeira.findFirst({
    where: {
      id,
      id_empresa: idEmpresa,
      status: "ATIVA",
      tipo: { in: ["DESPESA", "AMBOS"] },
    },
  })
}

export function countPayments(id: number, database: Database): Promise<number> {
  return database.pagamentos_pagar.count({ where: { id_conta_pagar: id } })
}

export function countLinkedExpenses(
  id: number,
  database: Database,
): Promise<number> {
  return database.despesas.count({ where: { id_conta_pagar: id } })
}

export function countPaidExpenses(
  id: number,
  database: Database,
): Promise<number> {
  return database.despesas.count({
    where: { id_conta_pagar: id, situacao: "PAGA" },
  })
}

export function update(
  id: number,
  data: Prisma.contas_pagarUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<ContaPagar> {
  return database.contas_pagar.update({
    where: { id, id_empresa: { in: companies } },
    data: { ...data, data_atualizacao: new Date() },
  })
}

export function patch(
  id: number,
  data: Prisma.contas_pagarUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<ContaPagar> {
  return update(id, data, companies, database)
}

export async function cancel(
  id: number,
  companies: number[],
  database: Database,
): Promise<ContaPagar> {
  return update(id, { situacao: "CANCELADO" }, companies, database)
}
