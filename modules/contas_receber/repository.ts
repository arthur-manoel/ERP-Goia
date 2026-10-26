import {
  Prisma,
  type contas_receber as ContaReceber,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { ValidationError } from "../../src/lib/api/errors"
import type { ContaReceberFilters, Pagination } from "./schema"

export type { ContaReceber }
export type Database = Prisma.TransactionClient
export { auditFinancial } from "../financeiro/auditoria"

/** O fechamento de pedidos também bloqueia empresas antes de gerar títulos.
 * O lock permanece até o commit; as leituras são posteriores à sua aquisição.
 */
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
      SELECT id FROM empresas
      WHERE id IN (${Prisma.join(ids)}) AND status = 'ATIVA'
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
  filters: ContaReceberFilters,
  companies: number[],
): Prisma.contas_receberWhereInput {
  const lancamentoFim =
    filters.data_lancamento_fim &&
    new Date(filters.data_lancamento_fim.getTime() + 86_400_000)
  return {
    AND: [
      { id_empresa: { in: companies } },
      ...(filters.id_empresa === undefined
        ? []
        : [{ id_empresa: filters.id_empresa }]),
      ...(filters.id_venda === undefined
        ? []
        : [{ id_venda: filters.id_venda }]),
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
  data: Prisma.contas_receberUncheckedCreateInput,
  database: Database,
): Promise<ContaReceber> {
  return database.contas_receber.create({ data })
}

export async function findAll(
  filters: ContaReceberFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: ContaReceber[]; count: number }> {
  const where = whereFor(filters, companies)
  const orderBy: Prisma.contas_receberOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
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

export function count(
  filters: ContaReceberFilters,
  companies: number[],
): Promise<number> {
  return prisma.contas_receber.count({ where: whereFor(filters, companies) })
}

export function findById(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<ContaReceber | null> {
  return database.contas_receber.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

export async function findForUpdate(
  id: number,
  companies: number[],
  database: Database,
): Promise<ContaReceber | null> {
  const locked = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM contas_receber
    WHERE id = ${id} AND id_empresa IN (${Prisma.join(companies)}) FOR UPDATE
  `
  if (!locked.length) return null
  return findById(id, companies, database)
}

export function findEmpresa(id: number, database: Database) {
  return database.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export function findVenda(id: number, idEmpresa: number, database: Database) {
  return database.venda.findFirst({
    where: { id, id_empresa: idEmpresa },
    include: {
      _count: { select: { pedido_cliente_fechamento: true } },
      pedido_cliente: {
        select: {
          status: true,
          _count: { select: { pedido_cliente_fechamento: true } },
        },
      },
    },
  })
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
      tipo: { in: ["RECEITA", "AMBOS"] },
    },
  })
}

export function countPayments(id: number, database: Database): Promise<number> {
  return database.pagamentos_receber.count({ where: { id_conta_receber: id } })
}

export function confirmedPayments(id: number, database: Database) {
  return database.pagamentos_receber.aggregate({
    where: { id_conta_receber: id, status: "CONFIRMADO" },
    _sum: { valor: true },
    _count: { _all: true },
    _min: { valor: true, id_empresa: true },
    _max: { id_empresa: true },
  })
}

export async function invalidConfirmedMovements(
  id: number,
  idEmpresa: number,
  database: Database,
): Promise<boolean> {
  const rows = await database.$queryRaw<Array<{ invalidos: bigint | number }>>`
    SELECT COUNT(*) AS invalidos FROM pagamentos_receber p
    WHERE p.id_conta_receber = ${id} AND p.status = 'CONFIRMADO' AND (
      p.id_empresa <> ${idEmpresa} OR p.valor <= 0 OR
      p.valor <> (SELECT COALESCE(SUM(m.valor), 0) FROM movimentacoes_financeiras m
        WHERE m.id_pagamento_receber = p.id AND m.id_empresa = p.id_empresa
          AND m.tipo = 'ENTRADA' AND m.origem = 'RECEBIMENTO') OR
      EXISTS (SELECT 1 FROM movimentacoes_financeiras m WHERE m.id_pagamento_receber = p.id
        AND (m.id_empresa <> p.id_empresa OR m.tipo <> 'ENTRADA'
          OR m.origem <> 'RECEBIMENTO' OR m.valor <= 0))
    )
  `
  return (
    !rows.length ||
    rows[0].invalidos === undefined ||
    Number(rows[0].invalidos) > 0
  )
}

export function update(
  id: number,
  data: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<ContaReceber> {
  return database.contas_receber.update({
    where: { id, id_empresa: { in: companies } },
    data: { ...data, data_atualizacao: new Date() },
  })
}

export function patch(
  id: number,
  data: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<ContaReceber> {
  return update(id, data, companies, database)
}

export async function cancel(
  id: number,
  companies: number[],
  database: Database,
): Promise<boolean> {
  await update(id, { situacao: "CANCELADO" }, companies, database)
  return true
}
