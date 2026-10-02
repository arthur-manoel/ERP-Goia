import {
  Prisma,
  type fornecedores as Fornecedor,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CreateFornecedorData,
  UpdateFornecedorData,
  FornecedorFilters,
  Pagination,
} from "./schema"

export type { Fornecedor }
export async function create(data: CreateFornecedorData): Promise<Fornecedor> {
  return prisma.fornecedores.create({ data })
}
export async function findAll(
  filters: FornecedorFilters,
  { page, limit }: Pagination,
): Promise<{ rows: Fornecedor[]; count: number }> {
  const where: Prisma.fornecedoresWhereInput = { ...filters }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.fornecedores.findMany({
        where,
        orderBy: [{ razao_social: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.fornecedores.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}
export async function findById(id: number): Promise<Fornecedor | null> {
  return prisma.fornecedores.findUnique({ where: { id } })
}
export async function findByCnpj(
  id_empresa: number | null,
  cnpj: string,
  excludeId?: number,
): Promise<Fornecedor | null> {
  const normalized = cnpj.replace(/[./-]/g, "").toUpperCase()
  const formatted = normalized.replace(
    /^(.{2})(.{3})(.{3})(.{4})(.{2})$/,
    "$1.$2.$3/$4-$5",
  )
  return prisma.fornecedores.findFirst({
    where: {
      id_empresa,
      cnpj: {
        in: [
          ...new Set([
            normalized,
            formatted,
            normalized.toLowerCase(),
            formatted.toLowerCase(),
          ]),
        ],
      },
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
  })
}
export async function update(
  id: number,
  data: UpdateFornecedorData,
): Promise<Fornecedor | null> {
  try {
    return await prisma.fornecedores.update({ where: { id }, data })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return null
    throw error
  }
}
export async function inactivate(id: number): Promise<boolean> {
  return (await update(id, { status: "INATIVO" })) !== null
}
