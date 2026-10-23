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
      if (error.code === "P2034") {
        throw new ConflictError(
          "O produto ou a categoria foi alterado por outra operação. Tente novamente.",
        )
      }
    }
    throw error
  }
}

export async function createProduto(input: unknown, companies: number[]) {
  const data = validate(createProdutoSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withCompaniesLock([data.id_empresa], async (database) => {
      if (await repository.findByCodigo(data.codigo, database))
        throw new ConflictError()
      if (data.id_categoria != null) {
        await validateCategory(data.id_categoria, [data.id_empresa], database)
      }
      return repository.create(data, database)
    }),
  )
}

async function validateCategory(
  id: number,
  owningCompanies: number[],
  database: Prisma.TransactionClient,
) {
  const uniqueCompanies = [...new Set(owningCompanies)]
  // id_categoria é global no produto. Uma categoria empresarial não pode
  // representar um produto compartilhado por empresas diferentes.
  if (
    uniqueCompanies.length !== 1 ||
    !(await repository.findActiveCategory(id, uniqueCompanies[0], database))
  ) {
    throw new ValidationError(
      "Categoria deve estar ativa e pertencer à mesma empresa de todos os vínculos do produto.",
    )
  }
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
  return write(() =>
    repository.withCompaniesLock(companies, async (database) => {
      if (data.id_categoria != null) {
        const current = await repository.findWritableById(
          id,
          companies,
          database,
        )
        if (!current) throw new NotFoundError()
        await validateCategory(
          data.id_categoria,
          current.produto_empresa.map((link) => link.id_empresa),
          database,
        )
      }
      const produto = await repository.update(id, data, companies, database)
      if (!produto) throw new NotFoundError()
      return produto
    }),
  )
}

export async function deleteProduto(idInput: unknown, companies: number[]) {
  const id = validate(produtoIdSchema, idInput)
  if (!(await write(() => repository.inactivate(id, companies))))
    throw new NotFoundError()
  return { message: "Produto inativado com sucesso." }
}
