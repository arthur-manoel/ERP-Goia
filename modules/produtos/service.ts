import { assertCompany } from "../catalogos/access"
import { Prisma } from "../../src/generated/prisma/client"
import * as repository from "./repository"
import {
  createProdutoSchema,
  updateProdutoSchema,
  listProdutosSchema,
  produtoIdSchema,
} from "./schema"

import { HttpError } from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
export class NotFoundError extends HttpError {
  constructor(message = "Produto não encontrado.") {
    super(404, message)
  }
}
export class ConflictError extends HttpError {
  constructor(message = "Já existe um produto com este código.") {
    super(409, message)
  }
}
export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message)
  }
}

// Mantém o tratamento de constraints; codigo não é UNIQUE no schema atual.
async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError()
      if (error.code === "P2003") {
        throw new ValidationError("Categoria ou tipo de produto inexistente.")
      }
      if (error.code === "P2000") {
        throw new ValidationError(
          "Um dos campos excede o tamanho permitido no banco de dados.",
        )
      }
    }
    throw error
  }
}

export async function createProduto(input: unknown, companies: number[]) {
  const data = validate(createProdutoSchema, input)
  assertCompany(data.id_empresa, companies)
  if (await repository.findByCodigo(data.codigo)) throw new ConflictError()
  return write(() => repository.create(data))
}

export async function listProdutos(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listProdutosSchema, input)
  assertCompany(filters.id_empresa, companies)
  const { rows, count } = await repository.findAll(
    filters,
    { page, limit },
    companies,
  )
  return { rows, count, page, limit, totalPages: Math.ceil(count / limit) }
}

export async function getProduto(idInput: unknown, companies: number[]) {
  const id = validate(produtoIdSchema, idInput)
  const produto = await repository.findById(id, companies)
  if (!produto) throw new NotFoundError()
  return produto
}

export async function updateProduto(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  const id = validate(produtoIdSchema, idInput)
  const data = validate(updateProdutoSchema, input)
  const produto = await write(() => repository.update(id, data, companies))
  if (!produto) throw new NotFoundError()
  return produto
}

export async function deleteProduto(idInput: unknown, companies: number[]) {
  const id = validate(produtoIdSchema, idInput)
  if (!(await write(() => repository.inactivate(id, companies))))
    throw new NotFoundError()
  return { message: "Produto inativado com sucesso." }
}
