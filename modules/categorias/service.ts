import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  HttpError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import { disputaPersistencia } from "../../src/lib/prisma-concorrencia"
import { assertCompany, type CatalogActor } from "../catalogos/access"
import { allowedCompanies } from "../catalogos/repository"
import * as repository from "./repository"
import {
  categoriaIdSchema,
  createCategoriaSchema,
  updateCategoriaSchema,
  patchCategoriaSchema,
  listCategoriasSchema,
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
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Nome já cadastrado nesta empresa ou conflito concorrente. Consulte os dados e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError(
          "Empresa inexistente ou relacionamento inválido.",
        )
      if (error.code === "P2025")
        throw new NotFoundError("Categoria não encontrada.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}
async function requireInactivate(
  actor: CatalogActor,
  companies: number[],
  database: repository.Database,
) {
  const allowed = await allowedCompanies(
    actor.idUsuario,
    "CATEGORIAS",
    "pode_excluir",
    database,
  )
  if (companies.some((id) => !allowed.includes(id)))
    throw new HttpError(
      403,
      "Sem permissão para inativar categorias nesta empresa.",
    )
}
async function checkName(
  nome: string,
  idEmpresa: number,
  database: repository.Database,
  excludeId?: number,
) {
  if (await repository.findByName(nome, idEmpresa, database, excludeId))
    throw new ConflictError(
      "Já existe uma categoria ativa com este nome nesta empresa.",
    )
}
export async function createCategoria(
  input: unknown,
  companies: number[],
  actor: CatalogActor,
) {
  const data = validate(createCategoriaSchema, input)
  const idEmpresa =
    data.id_empresa ?? (companies.length === 1 ? companies[0] : undefined)
  if (idEmpresa === undefined)
    throw new ValidationError(
      "Informe id_empresa quando houver mais de uma empresa autorizada.",
    )
  assertCompany(idEmpresa, companies)
  return write(() =>
    repository.withWriteLock([idEmpresa], async (database) => {
      if (data.status === "INATIVA")
        await requireInactivate(actor, [idEmpresa], database)
      else await checkName(data.nome, idEmpresa, database)
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
  const row = await repository.findById(
    validate(categoriaIdSchema, idInput),
    companies,
  )
  if (!row) throw new NotFoundError("Categoria não encontrada.")
  return row
}
async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  actor: CatalogActor,
  partial: boolean,
) {
  const id = validate(categoriaIdSchema, idInput)
  const data = partial
    ? validate(patchCategoriaSchema, input)
    : validate(updateCategoriaSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current || current.id_empresa === null)
        throw new NotFoundError("Categoria não encontrada.")
      const effective = {
        ...current,
        ...data,
        id_empresa: data.id_empresa ?? current.id_empresa,
      }
      const inactive =
        effective.status === "INATIVA" && current.status !== "INATIVA"
      if (inactive)
        await requireInactivate(
          actor,
          [current.id_empresa, effective.id_empresa],
          database,
        )
      if (inactive || effective.id_empresa !== current.id_empresa) {
        const products = await repository.countProducts(id, database)
        if (effective.id_empresa !== current.id_empresa && products > 0)
          throw new ConflictError(
            "Categoria com produtos vinculados não pode ser transferida para outra empresa.",
          )
      }
      if (effective.status === "ATIVA")
        await checkName(effective.nome, effective.id_empresa, database, id)
      return partial
        ? repository.patch(id, data, companies, database)
        : repository.update(id, data, companies, database)
    }),
  )
}
export const updateCategoria = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: CatalogActor,
) => update(id, input, companies, actor, false)
export const patchCategoria = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: CatalogActor,
) => update(id, input, companies, actor, true)
export async function deleteCategoria(
  idInput: unknown,
  companies: number[],
  actor: CatalogActor,
) {
  const id = validate(categoriaIdSchema, idInput)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current || current.id_empresa === null)
        throw new NotFoundError("Categoria não encontrada.")
      await requireInactivate(actor, [current.id_empresa], database)
      const produtos_vinculados = await repository.countProducts(id, database)
      if (current.status !== "INATIVA")
        await repository.inactivate(id, companies, database)
      return {
        message: "Categoria inativada com sucesso.",
        produtos_vinculados,
      }
    }),
  )
}
