import {
  Prisma,
  type tamanhos as Tamanho,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CreateTamanhoData,
  UpdateTamanhoData,
  TamanhoFilters,
  Pagination,
} from "./schema"

export type { Tamanho }
export async function create(data: CreateTamanhoData): Promise<Tamanho> {
  return prisma.tamanhos.create({ data })
}
export async function findAll(
  filters: TamanhoFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: Tamanho[]; count: number }> {
  const { busca, ...fields } = filters
  const where: Prisma.tamanhosWhereInput = {
    AND: [fields, scope(companies)],
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca } },
            { descricao: { contains: busca } },
          ],
        }
      : {}),
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.tamanhos.findMany({
        where,
        orderBy: [{ ordem: "asc" }, { nome: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tamanhos.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}
export async function findById(
  id: number,
  companies: number[],
): Promise<Tamanho | null> {
  return prisma.tamanhos.findFirst({ where: { ...scope(companies), id } })
}
export async function update(
  id: number,
  data: UpdateTamanhoData,
  companies: number[],
): Promise<Tamanho | null> {
  try {
    return await prisma.tamanhos.update({
      where: { ...scope(companies), id },
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
export async function inactivate(
  id: number,
  companies: number[],
): Promise<boolean> {
  return (await update(id, { status: "INATIVO" }, companies)) !== null
}

function scope(companies: number[]): Prisma.tamanhosWhereInput {
  return { id_empresa: { in: companies } }
}
