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
  createFornecedorSchema,
  updateFornecedorSchema,
  replaceFornecedorSchema,
  listFornecedoresSchema,
  fornecedorIdSchema,
} from "./schema"
export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"

const conflictMessage = "Já existe um fornecedor com este CNPJ nesta empresa."
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError(conflictMessage)
      if (error.code === "P2003")
        throw new ValidationError("Empresa inexistente.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}
async function checkCnpj(
  empresa: number | null,
  cnpj: string | null | undefined,
  excludeId?: number,
) {
  if (cnpj && (await repository.findByCnpj(empresa, cnpj, excludeId)))
    throw new ConflictError(conflictMessage)
}
export async function createFornecedor(input: unknown, companies: number[]) {
  const data = validate(createFornecedorSchema, input)
  assertCompany(data.id_empresa, companies)
  await checkCnpj(data.id_empresa, data.cnpj)
  return write(() => repository.create(data))
}
export async function listFornecedores(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listFornecedoresSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}
export async function getFornecedor(idInput: unknown, companies: number[]) {
  const id = validate(fornecedorIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Fornecedor não encontrado.")
  return row
}
export async function patchFornecedor(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  const id = validate(fornecedorIdSchema, idInput)
  const data = validate(updateFornecedorSchema, input)
  assertCompany(data.id_empresa, companies)
  const current = await repository.findById(id, companies)
  if (!current) throw new NotFoundError("Fornecedor não encontrado.")
  // Trocar a empresa também pode violar o índice composto, mesmo sem trocar o CNPJ.
  if (data.cnpj !== undefined || data.id_empresa !== undefined) {
    await checkCnpj(
      data.id_empresa ?? current.id_empresa,
      data.cnpj === undefined ? current.cnpj : data.cnpj,
      id,
    )
  }
  const row = await write(() => repository.patch(id, data, companies))
  if (!row) throw new NotFoundError("Fornecedor não encontrado.")
  return row
}
export async function deleteFornecedor(idInput: unknown, companies: number[]) {
  const id = validate(fornecedorIdSchema, idInput)
  if (!(await write(() => repository.inactivate(id, companies))))
    throw new NotFoundError("Fornecedor não encontrado.")
  return { message: "Fornecedor inativado com sucesso." }
}

export async function updateFornecedor(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  const id = validate(fornecedorIdSchema, idInput)
  const data = validate(replaceFornecedorSchema, input)
  assertCompany(data.id_empresa, companies)
  if (!(await repository.findById(id, companies)))
    throw new NotFoundError("Fornecedor não encontrado.")
  await checkCnpj(data.id_empresa, data.cnpj, id)
  const row = await write(() => repository.update(id, data, companies))
  if (!row) throw new NotFoundError("Fornecedor não encontrado.")
  return row
}
