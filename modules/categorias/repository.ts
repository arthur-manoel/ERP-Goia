import {
  Prisma,
  type categorias as Categoria,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { CategoriaFilters, Pagination } from "./schema"
export type { Categoria }
export type Database = Prisma.TransactionClient
export { withCompanyWriteLock as withWriteLock } from "../catalogos/transactions"

function whereFor(
  filters: CategoriaFilters,
  companies: number[],
): Prisma.categoriasWhereInput {
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
  data: Prisma.categoriasUncheckedCreateInput,
  database: Database,
): Promise<Categoria> {
  return database.categorias.create({ data })
}
export async function findAll(
  filters: CategoriaFilters,
  { page, limit }: Pagination,
  companies: number[],
) {
  const where = whereFor(filters, companies)
  const orderBy: Prisma.categoriasOrderByWithRelationInput[] = [
    { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
  const [rows, count] = await prisma.$transaction(
    [
      prisma.categorias.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.categorias.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}
export function count(
  filters: CategoriaFilters,
  companies: number[],
): Promise<number> {
  return prisma.categorias.count({ where: whereFor(filters, companies) })
}
export function findById(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<Categoria | null> {
  return database.categorias.findFirst({
    where: { id, id_empresa: { in: companies } },
  })
}
export async function findForUpdate(
  id: number,
  companies: number[],
  database: Database,
): Promise<Categoria | null> {
  const rows = await database.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM categorias WHERE id = ${id} AND id_empresa IN (${Prisma.join(companies)}) FOR UPDATE
  `
  return rows.length ? findById(id, companies, database) : null
}
export async function findByName(
  nome: string,
  idEmpresa: number,
  database: Database,
  excludeId?: number,
): Promise<Categoria | null> {
  const rows = await database.$queryRaw<Categoria[]>`
    SELECT id, id_empresa, nome, descricao, status FROM categorias
    WHERE id_empresa = ${idEmpresa} AND status = 'ATIVA'
      AND LOWER(TRIM(REGEXP_REPLACE(nome, '[[:space:]]+', ' '))) = LOWER(${nome})
      ${excludeId === undefined ? Prisma.empty : Prisma.sql`AND id <> ${excludeId}`}
    ORDER BY id LIMIT 1
  `
  return rows[0] ?? null
}
export function countProducts(id: number, database: Database): Promise<number> {
  return database.produtos.count({ where: { id_categoria: id } })
}
export function update(
  id: number,
  data: Prisma.categoriasUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<Categoria> {
  return database.categorias.update({
    where: { id, id_empresa: { in: companies } },
    data,
  })
}
export function patch(
  id: number,
  data: Prisma.categoriasUncheckedUpdateInput,
  companies: number[],
  database: Database,
): Promise<Categoria> {
  return update(id, data, companies, database)
}
export function inactivate(
  id: number,
  companies: number[],
  database: Database,
): Promise<Categoria> {
  return update(id, { status: "INATIVA" }, companies, database)
}
