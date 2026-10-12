import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import * as repository from "./repository"
import {
  createTipoProdutoSchema,
  listTiposProdutoSchema,
  replaceTipoProdutoSchema,
  tipoProdutoIdSchema,
  updateTipoProdutoSchema,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"

const conflictMessage = "Já existe um tipo de produto com este nome."

async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new ConflictError(conflictMessage)
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}

async function assertUniqueNome(nome: string, excludeId?: number) {
  if (await repository.findByNome(nome, excludeId))
    throw new ConflictError(conflictMessage)
}

export async function createTipoProduto(input: unknown) {
  const data = validate(createTipoProdutoSchema, input)
  await assertUniqueNome(data.nome)
  return write(() => repository.create(data))
}

export async function listTiposProduto(input: unknown) {
  const { page, limit, ...filters } = validate(listTiposProdutoSchema, input)
  const result = await repository.findAll(filters, { page, limit })
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}

export async function getTipoProduto(idInput: unknown) {
  const id = validate(tipoProdutoIdSchema, idInput)
  const row = await repository.findById(id)
  if (!row) throw new NotFoundError("Tipo de produto não encontrado.")
  return row
}

export async function patchTipoProduto(idInput: unknown, input: unknown) {
  const id = validate(tipoProdutoIdSchema, idInput)
  const data = validate(updateTipoProdutoSchema, input)
  if (data.nome !== undefined) await assertUniqueNome(data.nome, id)
  const row = await write(() => repository.patch(id, data))
  if (!row) throw new NotFoundError("Tipo de produto não encontrado.")
  return row
}

export async function updateTipoProduto(idInput: unknown, input: unknown) {
  const id = validate(tipoProdutoIdSchema, idInput)
  const data = validate(replaceTipoProdutoSchema, input)
  await assertUniqueNome(data.nome, id)
  const row = await write(() => repository.update(id, data))
  if (!row) throw new NotFoundError("Tipo de produto não encontrado.")
  return row
}

export async function deleteTipoProduto(idInput: unknown) {
  const id = validate(tipoProdutoIdSchema, idInput)
  const result = await write(() => repository.inactivate(id))
  if (result === "notFound")
    throw new NotFoundError("Tipo de produto não encontrado.")
  if (result === "inUse")
    throw new ConflictError(
      "Tipo de produto vinculado a produtos não pode ser removido.",
    )
  return { message: "Tipo de produto removido com sucesso." }
}
