import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";
import * as repository from "./repository";
import { createProdutoSchema, updateProdutoSchema, listProdutosSchema, produtoIdSchema } from "./schema";

export class NotFoundError extends Error {
  constructor(message = "Produto não encontrado.") { super(message); this.name = "NotFoundError"; }
}
export class ConflictError extends Error {
  constructor(message = "Já existe um produto com este código.") { super(message); this.name = "ConflictError"; }
}
export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((issue) =>
      `${issue.path.join(".") || "entrada"}: ${issue.message}`,
    ).join("; "));
  }
  return result.data;
}

// Mantém o tratamento de constraints; codigo não é UNIQUE no schema atual.
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError();
      if (error.code === "P2003") {
        throw new ValidationError("Categoria ou tipo de produto inexistente.");
      }
      if (error.code === "P2000") {
        throw new ValidationError("Um dos campos excede o tamanho permitido no banco de dados.");
      }
    }
    throw error;
  }
}

export async function createProduto(input: unknown) {
  const data = validate(createProdutoSchema, input);
  if (await repository.findByCodigo(data.codigo)) throw new ConflictError();
  return write(() => repository.create(data));
}

export async function listProdutos(input: unknown) {
  const { page, limit, ...filters } = validate(listProdutosSchema, input);
  const { rows, count } = await repository.findAll(filters, { page, limit });
  return { rows, count, page, limit, totalPages: Math.ceil(count / limit) };
}

export async function getProduto(idInput: unknown) {
  const id = validate(produtoIdSchema, idInput);
  const produto = await repository.findById(id);
  if (!produto) throw new NotFoundError();
  return produto;
}

export async function updateProduto(idInput: unknown, input: unknown) {
  const id = validate(produtoIdSchema, idInput);
  const data = validate(updateProdutoSchema, input);
  const produto = await write(() => repository.update(id, data));
  if (!produto) throw new NotFoundError();
  return produto;
}

export async function deleteProduto(idInput: unknown) {
  const id = validate(produtoIdSchema, idInput);
  if (!await write(() => repository.inactivate(id))) throw new NotFoundError();
  return { message: "Produto inativado com sucesso." };
}
