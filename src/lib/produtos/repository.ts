import { Prisma, type produtos as Produto } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import type { CreateProdutoData, UpdateProdutoData, ProdutoFilters, Pagination } from "./schema";

export type { Produto };

export async function create(data: CreateProdutoData): Promise<Produto> {
  return prisma.produtos.create({ data });
}

export async function findAll(
  filters: ProdutoFilters,
  { page, limit }: Pagination,
): Promise<{ rows: Produto[]; count: number }> {
  const where: Prisma.produtosWhereInput = { ...filters };
  const [rows, count] = await prisma.$transaction([
    prisma.produtos.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.produtos.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { rows, count };
}

export async function findById(id: number): Promise<Produto | null> {
  return prisma.produtos.findUnique({ where: { id } });
}

export async function findByCodigo(codigo: string): Promise<Produto | null> {
  // O schema atual define codigo como índice comum, não como @unique.
  return prisma.produtos.findFirst({ where: { codigo }, orderBy: { id: "asc" } });
}

export async function update(id: number, data: UpdateProdutoData): Promise<Produto | null> {
  try {
    return await prisma.produtos.update({ where: { id }, data });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

export async function inactivate(id: number): Promise<boolean> {
  return (await update(id, { status: "INATIVO" })) !== null;
}
