import {
  Prisma,
  type produtos as Produto,
} from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type {
  CreateProdutoData,
  UpdateProdutoData,
  ProdutoFilters,
  Pagination,
} from "./schema"

export type { Produto }

export async function create(data: CreateProdutoData): Promise<Produto> {
  const { id_empresa, ...fields } = data
  return prisma.produtos.create({
    data: {
      ...fields,
      produto_empresa: {
        create: { id_empresa, codigo_interno: fields.codigo },
      },
    },
  })
}

export async function findAll(
  filters: ProdutoFilters,
  { page, limit }: Pagination,
  companies: number[],
): Promise<{ rows: Produto[]; count: number }> {
  const { busca, id_empresa, ...fields } = filters
  const where: Prisma.produtosWhereInput = {
    ...fields,
    ...scope(
      id_empresa === undefined
        ? companies
        : companies.filter((id) => id === id_empresa),
    ),
    ...(busca
      ? { OR: [{ nome: { contains: busca } }, { codigo: { contains: busca } }] }
      : {}),
  }
  const [rows, count] = await prisma.$transaction(
    [
      prisma.produtos.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.produtos.count({ where }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
  return { rows, count }
}

export async function findById(
  id: number,
  companies: number[],
): Promise<Produto | null> {
  return prisma.produtos.findFirst({ where: { ...scope(companies), id } })
}

export async function findByCodigo(codigo: string): Promise<Produto | null> {
  // O schema atual define codigo como índice comum, não como @unique.
  return prisma.produtos.findFirst({
    where: { codigo },
    orderBy: { id: "asc" },
  })
}

export async function update(
  id: number,
  data: UpdateProdutoData,
  companies: number[],
): Promise<Produto | null> {
  try {
    return await prisma.produtos.update({
      where: { ...scope(companies, true), id },
      data,
    })
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return null
    }
    throw error
  }
}

export async function inactivate(
  id: number,
  companies: number[],
): Promise<boolean> {
  return (await update(id, { status: "INATIVO" }, companies)) !== null
}

function scope(
  companies: number[],
  writing = false,
): Prisma.produtosWhereInput {
  return {
    produto_empresa: {
      some: { id_empresa: { in: companies } },
      ...(writing ? { every: { id_empresa: { in: companies } } } : {}),
    },
  }
}
