import { Prisma, type cores as Cor } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CreateCorData,
  UpdateCorData,
  CorFilters,
  Pagination,
} from "./schema"

export type { Cor }
export async function create(data: CreateCorData): Promise<Cor> {
  return prisma.cores.create({ data })
}
export async function findAll(
  filters: CorFilters,
  { page, limit }: Pagination,
): Promise<{ rows: Cor[]; count: number }> {
  const where: Prisma.coresWhereInput = {
    ...filters,
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.cores.findMany({
        where,
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.cores.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}
export async function findById(id: number): Promise<Cor | null> {
  return prisma.cores.findUnique({ where: { id } })
}
export async function update(
  id: number,
  data: UpdateCorData,
): Promise<Cor | null> {
  try {
    return await prisma.cores.update({ where: { id }, data })
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
  return (await update(id, { status: "INATIVA" })) !== null
}
