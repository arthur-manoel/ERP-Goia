import { Prisma } from "../../generated/prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../api/errors";
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
function allowEmpresa(id: number, empresas: number[]) {
  if (!empresas.includes(id)) throw new ForbiddenError("Sem acesso a esta empresa.");
}
export async function createTamanho(input: unknown, usuarioId: number) {
  const data = validate(createTamanhoSchema, input);
  allowEmpresa(data.id_empresa, await repository.findEmpresasDoUsuario(usuarioId));
  return write(() => repository.create(data));
}
export async function listTamanhos(input: unknown, usuarioId: number) {
  const { page, limit, ...filters } = validate(listTamanhosSchema, input);
  const empresas = await repository.findEmpresasDoUsuario(usuarioId);
  if (filters.id_empresa !== undefined) allowEmpresa(filters.id_empresa, empresas);
  const result = await repository.findAll(filters, { page, limit }, empresas);
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) };
}
export async function getTamanho(idInput: unknown, usuarioId: number) {
  const id = validate(tamanhoIdSchema, idInput);
  const empresas = await repository.findEmpresasDoUsuario(usuarioId);
  const row = await repository.findById(id);
  if (!row || !empresas.includes(row.id_empresa)) throw new NotFoundError("Tamanho não encontrado.");
  return row;
}
export async function updateTamanho(idInput: unknown, input: unknown, usuarioId: number) {
  const id = validate(tamanhoIdSchema, idInput);
  const data = validate(updateTamanhoSchema, input);
  const empresas = await repository.findEmpresasDoUsuario(usuarioId);
  if (data.id_empresa !== undefined) allowEmpresa(data.id_empresa, empresas);
  const row = await write(() => repository.update(id, data, empresas));
  if (!row) throw new NotFoundError("Tamanho não encontrado.");
  return row;
}
export async function deleteTamanho(idInput: unknown, usuarioId: number) {
  const id = validate(tamanhoIdSchema, idInput);
  const empresas = await repository.findEmpresasDoUsuario(usuarioId);
  if (!await write(() => repository.inactivate(id, empresas))) throw new NotFoundError("Tamanho não encontrado.");
  return { message: "Tamanho inativado com sucesso." };
}
