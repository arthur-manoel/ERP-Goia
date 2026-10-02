import { assertCompany } from "../catalogos/access"
import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import * as repository from "./repository"
import {
  createTamanhoSchema,
  updateTamanhoSchema,
  listTamanhosSchema,
  tamanhoIdSchema,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new ConflictError(
          "Já existe um tamanho com este nome nesta empresa.",
        )
      if (error.code === "P2003")
        throw new ValidationError("Empresa inexistente.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}
export async function createTamanho(input: unknown, companies: number[]) {
  const data = validate(createTamanhoSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() => repository.create(data))
}
export async function listTamanhos(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listTamanhosSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}
export async function getTamanho(idInput: unknown, companies: number[]) {
  const id = validate(tamanhoIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Tamanho não encontrado.")
  return row
}
export async function updateTamanho(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  const id = validate(tamanhoIdSchema, idInput)
  const data = validate(updateTamanhoSchema, input)
  assertCompany(data.id_empresa, companies)
  const row = await write(() => repository.update(id, data, companies))
  if (!row) throw new NotFoundError("Tamanho não encontrado.")
  return row
}
export async function deleteTamanho(idInput: unknown, companies: number[]) {
  const id = validate(tamanhoIdSchema, idInput)
  if (!(await write(() => repository.inactivate(id, companies))))
    throw new NotFoundError("Tamanho não encontrado.")
  return { message: "Tamanho inativado com sucesso." }
}
