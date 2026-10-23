import {
  Prisma,
  type categorias as Categoria,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CategoriaFilters,
  CreateCategoriaData,
  PatchCategoriaData,
  Pagination,
  UpdateCategoriaData,
} from "./schema"

export type { Categoria }
type Database = Prisma.TransactionClient
export { withCompaniesLock } from "../catalogos/transactions"

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
      ...(filters.status === undefined ? [] : [{ status: filters.status }]),
      ...(filters.nome === undefined
        ? []
        : [{ nome: { contains: filters.nome } }]),
      ...(filters.busca ? [{ nome: { contains: filters.busca } }] : []),
    ],
  }
}

export function create(
  data: CreateCategoriaData & { id_empresa: number },
  database: Database = prisma,
): Promise<Categoria> {
  return database.categorias.create({ data })
}

export async function findAll(
  filters: CategoriaFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: Categoria[]; count: number }> {
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

/** SQL parametrizado também reconhece espaços excedentes em nomes legados.
 * A comparação ocorre no banco e retorna no máximo um registro.
 */
export async function findByName(
  nome: string,
  idEmpresa: number,
  excludeId?: number,
  database: Database = prisma,
): Promise<Categoria | null> {
  const rows = await database.$queryRaw<Categoria[]>(Prisma.sql`
    SELECT id, id_empresa, nome, descricao, status FROM categorias
    WHERE id_empresa = ${idEmpresa} AND status = 'ATIVA'
      AND LOWER(TRIM(REGEXP_REPLACE(nome, '[[:space:]]+', ' '))) = LOWER(${nome})
      ${excludeId === undefined ? Prisma.empty : Prisma.sql`AND id <> ${excludeId}`}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export function findEmpresa(id: number, database: Database = prisma) {
  return database.empresas.findFirst({ where: { id, status: "ATIVA" } })
}

export function countLinkedProducts(
  id: number,
  database: Database = prisma,
): Promise<number> {
  return database.produtos.count({ where: { id_categoria: id } })
}

async function write(
  id: number,
  data: PatchCategoriaData,
  companies: number[],
  database: Database,
): Promise<Categoria | null> {
  try {
    return await database.categorias.update({
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
  data: UpdateCategoriaData,
  companies: number[],
  database: Database = prisma,
) {
  return write(id, data, companies, database)
}

export function patch(
  id: number,
  data: PatchCategoriaData,
  companies: number[],
  database: Database = prisma,
) {
  return write(id, data, companies, database)
}

export async function inactivate(
  id: number,
  companies: number[],
  database: Database = prisma,
): Promise<boolean> {
  return (await write(id, { status: "INATIVA" }, companies, database)) !== null
}
