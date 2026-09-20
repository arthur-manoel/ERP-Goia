import { Prisma } from "../../src/generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../../src/lib/api/errors";
import { validate } from "../../src/lib/api/http";
import * as repository from "./repository";
import { createCorSchema, updateCorSchema, listCoresSchema, corIdSchema } from "./schema";

export { ConflictError, NotFoundError, ValidationError } from "../../src/lib/api/errors";
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError("Já existe uma cor com este nome nesta empresa.");
      if (error.code === "P2003") throw new ValidationError("Empresa inexistente.");
      if (error.code === "P2000") throw new ValidationError("Um dos campos excede o tamanho permitido.");
    }
    throw error;
  }
}
export async function createCor(input: unknown) {
  const data = validate(createCorSchema, input);
  return write(() => repository.create(data));
}
export async function listCores(input: unknown) {
  const { page, limit, ...filters } = validate(listCoresSchema, input);
  const result = await repository.findAll(filters, { page, limit });
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) };
}
export async function getCor(idInput: unknown) {
  const id = validate(corIdSchema, idInput);
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError("Cor não encontrada.");
  return row;
}
export async function updateCor(idInput: unknown, input: unknown) {
  const id = validate(corIdSchema, idInput);
  const data = validate(updateCorSchema, input);
  const row = await write(() => repository.update(id, data));
  if (!row) throw new NotFoundError("Cor não encontrada.");
  return row;
}
export async function deleteCor(idInput: unknown) {
  const id = validate(corIdSchema, idInput);
  if (!await write(() => repository.inactivate(id))) throw new NotFoundError("Cor não encontrada.");
  return { message: "Cor inativada com sucesso." };
}
