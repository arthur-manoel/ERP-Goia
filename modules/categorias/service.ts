import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import { assertCompany } from "../catalogos/access"
import * as repository from "./repository"
import {
  categoriaIdSchema,
  createCategoriaSchema,
  listCategoriasSchema,
  normalizeName,
  patchCategoriaSchema,
  updateCategoriaSchema,
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
          "Já existe uma categoria com este nome nesta empresa.",
        )
      if (error.code === "P2003")
        throw new ValidationError("Empresa inexistente.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
      if (error.code === "P2034")
        throw new ConflictError(
          "A categoria foi alterada por outra operação. Tente novamente.",
        )
    }
    throw error
  }
}

function resolveCompany(id: number | undefined, companies: number[]) {
  if (id !== undefined) {
    assertCompany(id, companies)
    return id
  }
  if (companies.length !== 1)
    throw new ValidationError(
      "Informe id_empresa para selecionar a empresa da categoria.",
    )
  return companies[0]
}

export async function createCategoria(input: unknown, companies: number[]) {
  const data = validate(createCategoriaSchema, input)
  const idEmpresa = resolveCompany(data.id_empresa, companies)
  return write(() =>
    repository.withCompaniesLock(companies, async (database) => {
      if (!(await repository.findEmpresa(idEmpresa, database)))
        throw new ValidationError("Empresa inexistente ou inativa.")
      if (
        data.status === "ATIVA" &&
        (await repository.findByName(data.nome, idEmpresa, undefined, database))
      ) {
        throw new ConflictError(
          "Já existe uma categoria ativa com este nome nesta empresa.",
        )
      }
      return repository.create({ ...data, id_empresa: idEmpresa }, database)
    }),
  )
}

export async function listCategorias(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listCategoriasSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}

export async function getCategoria(idInput: unknown, companies: number[]) {
  const id = validate(categoriaIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Categoria não encontrada.")
  return row
}

async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  partial: boolean,
) {
  const id = validate(categoriaIdSchema, idInput)
  const data = partial
    ? validate(patchCategoriaSchema, input)
    : validate(updateCategoriaSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withCompaniesLock(companies, async (database) => {
      const current = await repository.findById(id, companies, database)
      if (!current) throw new NotFoundError("Categoria não encontrada.")
      const idEmpresa = resolveCompany(
        data.id_empresa ?? current.id_empresa ?? undefined,
        companies,
      )
      // Transferências não podem levar os vínculos de produtos históricos
      // para outra empresa. Categorias sem produtos podem ser transferidas
      // entre empresas autorizadas, cujos bloqueios já foram adquiridos.
      if (
        idEmpresa !== current.id_empresa &&
        (await repository.countLinkedProducts(id, database)) > 0
      )
        throw new ConflictError(
          "Categoria com produtos vinculados não pode ser transferida para outra empresa.",
        )
      if (!(await repository.findEmpresa(idEmpresa, database)))
        throw new ValidationError("Empresa inexistente ou inativa.")
      const nome = normalizeName(data.nome ?? current.nome)
      if (
        (data.status ?? current.status) === "ATIVA" &&
        (await repository.findByName(nome, idEmpresa, id, database))
      ) {
        throw new ConflictError(
          "Já existe uma categoria ativa com este nome nesta empresa.",
        )
      }
      const row = partial
        ? await repository.patch(id, data, companies, database)
        : await repository.update(
            id,
            validate(updateCategoriaSchema, input),
            companies,
            database,
          )
      if (!row) throw new NotFoundError("Categoria não encontrada.")
      return row
    }),
  )
}

export function updateCategoria(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(idInput, input, companies, false)
}

export function patchCategoria(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(idInput, input, companies, true)
}

export async function deleteCategoria(idInput: unknown, companies: number[]) {
  const id = validate(categoriaIdSchema, idInput)
  return write(() =>
    repository.withCompaniesLock(companies, async (database) => {
      if (!(await repository.findById(id, companies, database)))
        throw new NotFoundError("Categoria não encontrada.")
      // Apenas conta os vínculos; produtos e referências históricas são mantidos.
      const produtosVinculados = await repository.countLinkedProducts(
        id,
        database,
      )
      if (!(await repository.inactivate(id, companies, database)))
        throw new NotFoundError("Categoria não encontrada.")
      return {
        message: "Categoria inativada com sucesso.",
        produtos_vinculados: produtosVinculados,
      }
    }),
  )
}
