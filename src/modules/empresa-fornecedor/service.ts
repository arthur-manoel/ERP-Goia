import "server-only"
import { Prisma } from "@/generated/prisma/client"
import {
  ConflictError,
  HttpError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"
import { validate } from "@/lib/api/http"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import {
  allowedCompanies,
  type Action,
} from "../../../modules/catalogos/repository"
import * as repo from "./repository"
import * as s from "./schema"
import type { Contexto, Database } from "./repository"

async function permission(ctx: Contexto, action: Action, tx: Database) {
  if (
    !(
      await allowedCompanies(ctx.idUsuario, "FORNECEDORES", action, tx)
    ).includes(ctx.idEmpresa)
  )
    throw new HttpError(
      403,
      "Sem permissão para esta operação na empresa ativa.",
    )
}
async function write<T>(
  ctx: Contexto,
  action: Action,
  operation: (tx: Database) => Promise<T>,
) {
  try {
    return await repo.write(ctx, async (tx) => {
      await permission(ctx, action, tx)
      return operation(tx)
    })
  } catch (error) {
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Associação já existente ou operação concorrente. Recarregue os dados e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2003", "P2004"].includes(error.code))
        throw new ValidationError(
          "Fornecedor indisponível ou relacionamento alterado. Recarregue os dados.",
        )
      if (error.code === "P2025")
        throw new NotFoundError("Associação não encontrada.")
      if (["P2000", "P2020"].includes(error.code))
        throw new ValidationError("Há valores fora dos limites permitidos.")
    }
    throw error
  }
}
async function required(ctx: Contexto, id: number, tx?: Database) {
  const current = await repo.findById(ctx, id, tx)
  if (!current) throw new NotFoundError("Associação não encontrada.")
  return current
}
async function eligible(id: number, tx: Database) {
  const supplier = await repo.findGlobalSupplier(id, tx)
  if (!supplier || supplier.status !== "ATIVO")
    throw new ValidationError(
      "Selecione um fornecedor global ativo disponível para associação.",
    )
}
const pageResult = <T>(
  result: { rows: T[]; count: number },
  page: number,
  limit: number,
) => ({ ...result, page, limit, totalPages: Math.ceil(result.count / limit) })
export async function findAll(ctx: Contexto, input: unknown) {
  const filters = validate(s.filtersSchema, input)
  return pageResult(
    await repo.findAll(ctx, filters),
    filters.page,
    filters.limit,
  )
}
export function findById(ctx: Contexto, input: unknown) {
  return required(ctx, validate(s.paramsSchema, input).id)
}
export async function suppliers(ctx: Contexto, input: unknown) {
  const filters = validate(s.suppliersSchema, input)
  return pageResult(
    await repo.availableSuppliers(ctx, filters),
    filters.page,
    filters.limit,
  )
}
export function create(ctx: Contexto, input: unknown) {
  const data = validate(s.createSchema, input)
  return write(ctx, "pode_criar", async (tx) => {
    await eligible(data.id_fornecedor, tx)
    const current = await repo.findByEmpresaFornecedor(
      ctx,
      data.id_fornecedor,
      tx,
    )
    if (current?.status === "ATIVO")
      throw new ConflictError(
        "Este fornecedor já possui associação ativa com a empresa.",
      )
    const { id_fornecedor, ...conditions } = data
    const result = current
      ? await repo.activate(ctx, current.id, conditions, tx)
      : await repo.create(ctx, { ...conditions, id_fornecedor }, tx)
    await repo.audit(ctx, result.id, current, result, tx)
    return result
  })
}
export function update(
  ctx: Contexto,
  params: unknown,
  input: unknown,
  partial = false,
) {
  const id = validate(s.paramsSchema, params).id
  const data = partial
    ? validate(s.patchSchema, input)
    : validate(s.updateSchema, input)
  return write(ctx, "pode_editar", async (tx) => {
    const current = await required(ctx, id, tx)
    if (data.status === "INATIVO") await permission(ctx, "pode_excluir", tx)
    if (data.status === "ATIVO") await eligible(current.id_fornecedor, tx)
    const result = await repo.update(ctx, id, data, tx)
    await repo.audit(ctx, id, current, result, tx)
    return result
  })
}
export function patch(ctx: Contexto, params: unknown, input: unknown) {
  return update(ctx, params, input, true)
}
export function inactivate(ctx: Contexto, params: unknown) {
  const id = validate(s.paramsSchema, params).id
  return write(ctx, "pode_excluir", async (tx) => {
    const current = await required(ctx, id, tx)
    if (current.status === "INATIVO") return current
    const result = await repo.inactivate(ctx, id, tx)
    await repo.audit(ctx, id, current, result, tx)
    return result
  })
}
