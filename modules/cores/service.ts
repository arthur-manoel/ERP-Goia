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
  createCorSchema,
  updateCorSchema,
  listCoresSchema,
  corIdSchema,
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
          "Já existe uma cor com este nome nesta empresa.",
        )
      if (error.code === "P2003")
        throw new ValidationError("Empresa inexistente.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}
export async function createCor(input: unknown, companies: number[]) {
  const data = validate(createCorSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() => repository.create(data))
}
export async function listCores(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listCoresSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}
export async function getCor(idInput: unknown, companies: number[]) {
  const id = validate(corIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Cor não encontrada.")
  return row
}
export async function updateCor(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  const id = validate(corIdSchema, idInput)
  const data = validate(updateCorSchema, input)
  assertCompany(data.id_empresa, companies)
  const row = await write(() => repository.update(id, data, companies))
  if (!row) throw new NotFoundError("Cor não encontrada.")
  return row
}
export async function deleteCor(idInput: unknown, companies: number[]) {
  const id = validate(corIdSchema, idInput)
  if (!(await write(() => repository.inactivate(id, companies))))
    throw new NotFoundError("Cor não encontrada.")
  return { message: "Cor inativada com sucesso." }
}
