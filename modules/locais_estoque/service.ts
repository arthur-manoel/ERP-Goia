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
  createLocalSchema,
  listLocaisSchema,
  localIdSchema,
  patchLocalSchema,
} from "./schema"
export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"

const naoEncontrado = "Local de estoque não encontrado."

async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Já existe um local com este nome nesta empresa ou houve conflito concorrente. Consulte os dados e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError(
          "Empresa inexistente ou relacionamento inválido.",
        )
      if (error.code === "P2025") throw new NotFoundError(naoEncontrado)
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}

async function requireInactivate(
  actor: CatalogActor,
  idEmpresa: number,
  database: repository.Database,
) {
  const allowed = await allowedCompanies(
    actor.idUsuario,
    "ESTOQUE",
    "pode_excluir",
    database,
  )
  if (!allowed.includes(idEmpresa))
    throw new HttpError(
      403,
      "Sem permissão para inativar locais de estoque nesta empresa.",
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
      "Já existe um local com este nome nesta empresa (pode estar inativo).",
    )
}

async function assertSemSaldo(id: number, database: repository.Database) {
  if ((await repository.countPosicoesComSaldo(id, database)) > 0)
    throw new ConflictError(
      "O local ainda tem saldo ou reserva em estoque. Transfira ou baixe o saldo antes de inativá-lo.",
    )
}

export async function createLocal(
  input: unknown,
  companies: number[],
  actor: CatalogActor,
) {
  const data = validate(createLocalSchema, input)
  const idEmpresa =
    data.id_empresa ?? (companies.length === 1 ? companies[0] : undefined)
  if (idEmpresa === undefined)
    throw new ValidationError(
      "Informe id_empresa quando houver mais de uma empresa autorizada.",
    )
  assertCompany(idEmpresa, companies)
  return write(() =>
    repository.withWriteLock([idEmpresa], async (database) => {
      if (data.status === "INATIVO")
        await requireInactivate(actor, idEmpresa, database)
      await checkName(data.nome, idEmpresa, database)
      return repository.create({ ...data, id_empresa: idEmpresa }, database)
    }),
  )
}

export async function listLocais(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listLocaisSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}

export async function getLocal(idInput: unknown, companies: number[]) {
  const row = await repository.findById(
    validate(localIdSchema, idInput),
    companies,
  )
  if (!row) throw new NotFoundError(naoEncontrado)
  return row
}

export async function patchLocal(
  idInput: unknown,
  input: unknown,
  companies: number[],
  actor: CatalogActor,
) {
  const id = validate(localIdSchema, idInput)
  const data = validate(patchLocalSchema, input)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError(naoEncontrado)
      if (data.status === "INATIVO" && current.status !== "INATIVO") {
        await requireInactivate(actor, current.id_empresa, database)
        await assertSemSaldo(id, database)
      }
      if (data.nome !== undefined)
        await checkName(data.nome, current.id_empresa, database, id)
      return repository.patch(id, data, companies, database)
    }),
  )
}

/** DELETE inativa: as chaves de estoque, kardex e movimentações são RESTRICT. */
export async function deleteLocal(
  idInput: unknown,
  companies: number[],
  actor: CatalogActor,
) {
  const id = validate(localIdSchema, idInput)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError(naoEncontrado)
      await requireInactivate(actor, current.id_empresa, database)
      if (current.status !== "INATIVO") {
        await assertSemSaldo(id, database)
        await repository.inactivate(id, companies, database)
      }
      return { message: "Local de estoque inativado com sucesso." }
    }),
  )
}
