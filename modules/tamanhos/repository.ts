import { Prisma, type tamanhos as Tamanho } from "../../src/generated/prisma/client";
import { prisma } from "../../src/lib/prisma";
import type { CreateTamanhoData, UpdateTamanhoData, TamanhoFilters, Pagination } from "./schema";

export type { Tamanho };
export async function create(data: CreateTamanhoData): Promise<Tamanho> {
  return prisma.tamanhos.create({ data });
}
export async function findAll(filters: TamanhoFilters, { page, limit }: Pagination): Promise<{ rows: Tamanho[]; count: number }> {
  const where: Prisma.tamanhosWhereInput = {
    ...filters,
  };
  const [rows, count] = await prisma.$transaction([
    prisma.tamanhos.findMany({ where, orderBy: [{ ordem: "asc" }, { nome: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit, take: limit }),
    prisma.tamanhos.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { rows, count };
}
export async function findById(id: number): Promise<Tamanho | null> {
  return prisma.tamanhos.findUnique({ where: { id } });
}
export async function update(id: number, data: UpdateTamanhoData): Promise<Tamanho | null> {
  try {
    return await prisma.tamanhos.update({ where: { id }, data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}
export async function inactivate(id: number): Promise<boolean> {
  return (await update(id, { status: "INATIVO" })) !== null;
}
