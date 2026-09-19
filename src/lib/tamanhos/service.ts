import { Prisma } from "../../generated/prisma/client";
import { ConflictError, NotFoundError, ValidationError } from "../api/errors";
import { validate } from "../api/http";
import * as repository from "./repository";
import { createTamanhoSchema, updateTamanhoSchema, listTamanhosSchema, tamanhoIdSchema } from "./schema";

export { ConflictError, NotFoundError, ValidationError } from "../api/errors";
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError("Já existe um tamanho com este nome nesta empresa.");
      if (error.code === "P2003") throw new ValidationError("Empresa inexistente.");
      if (error.code === "P2000") throw new ValidationError("Um dos campos excede o tamanho permitido.");
    }
    throw error;
  }
}
export async function createTamanho(input: unknown) {
  const data = validate(createTamanhoSchema, input);
  return write(() => repository.create(data));
}
export async function listTamanhos(input: unknown) {
  const { page, limit, ...filters } = validate(listTamanhosSchema, input);
  const result = await repository.findAll(filters, { page, limit });
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) };
}
export async function getTamanho(idInput: unknown) {
  const id = validate(tamanhoIdSchema, idInput);
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError("Tamanho não encontrado.");
  return row;
}
export async function updateTamanho(idInput: unknown, input: unknown) {
  const id = validate(tamanhoIdSchema, idInput);
  const data = validate(updateTamanhoSchema, input);
  const row = await write(() => repository.update(id, data));
  if (!row) throw new NotFoundError("Tamanho não encontrado.");
  return row;
}
export async function deleteTamanho(idInput: unknown) {
  const id = validate(tamanhoIdSchema, idInput);
  if (!await write(() => repository.inactivate(id))) throw new NotFoundError("Tamanho não encontrado.");
  return { message: "Tamanho inativado com sucesso." };
}
