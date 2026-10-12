import {
  Prisma,
  type tipos_produto as TipoProduto,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CreateTipoProdutoData,
  Pagination,
  ReplaceTipoProdutoData,
  TipoProdutoFilters,
  UpdateTipoProdutoData,
} from "./schema"

export type { TipoProduto }

export async function create(
  data: CreateTipoProdutoData,
): Promise<TipoProduto> {
  return prisma.tipos_produto.create({ data })
}

export async function findAll(
  filters: TipoProdutoFilters,
  { page, limit }: Pagination,
): Promise<{ rows: TipoProduto[]; count: number }> {
  const where: Prisma.tipos_produtoWhereInput = { ...filters }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.tipos_produto.findMany({
        where,
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tipos_produto.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export async function findById(id: number): Promise<TipoProduto | null> {
  return prisma.tipos_produto.findUnique({ where: { id } })
}

export async function findByNome(
  nome: string,
  excludeId?: number,
): Promise<TipoProduto | null> {
  return prisma.tipos_produto.findFirst({
    where: {
      nome,
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
  })
}

export async function patch(
  id: number,
  data: UpdateTipoProdutoData,
): Promise<TipoProduto | null> {
  try {
    return await prisma.tipos_produto.update({ where: { id }, data })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return null
    throw error
  }
}

export async function update(
  id: number,
  data: ReplaceTipoProdutoData,
): Promise<TipoProduto | null> {
  return patch(id, data)
}

export type InactivateResult = "deleted" | "inUse" | "notFound"

/** O schema não possui status; só remove um tipo sem produtos vinculados. */
export async function inactivate(id: number): Promise<InactivateResult> {
  if (await prisma.produtos.count({ where: { id_tipo_produto: id } }))
    return "inUse"
  try {
    await prisma.tipos_produto.delete({ where: { id } })
    return "deleted"
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return "notFound"
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    )
      return "inUse"
    throw error
  }
}
