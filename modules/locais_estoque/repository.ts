import { gravarCatalogo } from "../catalogos/auditoria"
import {
  Prisma,
  type locais_estoque as LocalEstoque,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { LocalFilters, Pagination } from "./schema"
export type { LocalEstoque }
export type Database = Prisma.TransactionClient
export { withCompanyWriteLock as withWriteLock } from "../catalogos/transactions"

function whereFor(
  filters: LocalFilters,
  companies: number[],
): Prisma.locais_estoqueWhereInput {
  return {
    AND: [
      { id_empresa: { in: companies } },
      ...(filters.id_empresa === undefined
        ? []
        : [{ id_empresa: filters.id_empresa }]),
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(filters.nome ? [{ nome: { contains: filters.nome } }] : []),
      ...(filters.busca ? [{ nome: { contains: filters.busca } }] : []),
    ],
  }
}

export function create(
  data: Prisma.locais_estoqueUncheckedCreateInput,
  database: Database,
): Promise<LocalEstoque> {
  return gravarCatalogo("locais_estoque", null, database, (tx) =>
    tx.locais_estoque.create({ data }),
  )
}

export async function findAll(
  filters: LocalFilters,
  { page, limit }: Pagination,
  companies: number[],
) {
  const where = whereFor(filters, companies)
  const orderBy: Prisma.locais_estoqueOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.locais_estoque.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.locais_estoque.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export function findById(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<LocalEstoque | null> {
  return database.locais_estoque.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}

export async function findForUpdate(
  id: number,
  companies: number[],
  database: Database,
): Promise<LocalEstoque | null> {
  const rows = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM locais_estoque WHERE id = ${id} AND id_empresa IN (${Prisma.join(companies)}) FOR UPDATE
  `
  return rows.length ? findById(id, companies, database) : null
}

/**
 * A unicidade (empresa + nome) vale também para locais inativos, então a busca
 * não filtra por status. O MySQL compara sem diferenciar maiúsculas/acentos.
 */
export function findByName(
  nome: string,
  idEmpresa: number,
  database: Database,
  excludeId?: number,
): Promise<LocalEstoque | null> {
  return database.locais_estoque.findFirst({
    where: {
      id_empresa: idEmpresa,
      nome,
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
  })
}

/** Posições do local com saldo ou reserva: impedem a inativação. */
export function countPosicoesComSaldo(
  id: number,
  database: Database,
): Promise<number> {
  return database.estoque.count({
    where: {
      id_local_estoque: id,
      OR: [{ quantidade: { gt: 0 } }, { quantidade_reservada: { gt: 0 } }],
    },
  })
}

export function patch(
  id: number,
  data: Prisma.locais_estoqueUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<LocalEstoque> {
  return gravarCatalogo("locais_estoque", id, database, (tx) =>
    tx.locais_estoque.update({
      where: { id, id_empresa: { in: companies } },
      data,
    }),
  )
}

export function inactivate(
  id: number,
  companies: number[],
  database: Database,
): Promise<LocalEstoque> {
  return patch(id, { status: "INATIVO" }, companies, database)
}
