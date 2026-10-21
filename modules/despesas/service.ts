import { Prisma } from "../../src/generated/prisma/client"
import { assertCompany } from "../catalogos/access"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import * as repository from "./repository"
import {
  createDespesaSchema,
  despesaIdSchema,
  listDespesasSchema,
  replaceDespesaSchema,
  updateDespesaSchema,
  type CreateDespesaData,
  type ReplaceDespesaData,
  type UpdateDespesaData,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"

type WritableData = CreateDespesaData | ReplaceDespesaData | UpdateDespesaData

async function validateRelations(
  idEmpresa: number,
  idCategoria: number,
  idContaPagar: number | null,
  companies: number[],
) {
  assertCompany(idEmpresa, companies)
  const [empresa, categoria, conta] = await Promise.all([
    repository.findEmpresa(idEmpresa),
    repository.findCategoria(idCategoria, idEmpresa),
    idContaPagar === null
      ? Promise.resolve(null)
      : repository.findContaPagar(idContaPagar, idEmpresa),
  ])
  if (!empresa) throw new ValidationError("Empresa inexistente ou inativa.")
  if (!categoria)
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com despesa.",
    )
  if (idContaPagar !== null && !conta)
    throw new ValidationError(
      "Conta a pagar inexistente, cancelada ou pertencente a outra empresa.",
    )
}

function assertSituationTransition(
  current: repository.Despesa,
  requested: CreateDespesaData["situacao"] | undefined,
) {
  if (current.situacao === "CANCELADA" && requested === "ABERTA")
    throw new ConflictError("Despesa cancelada não pode voltar para aberta.")
  if (current.situacao === "PAGA" && requested === "ABERTA")
    throw new ConflictError("Despesa paga não pode voltar para aberta.")
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError("Relacionamento informado não existe.")
      if (error.code === "P2002")
        throw new ConflictError("A despesa viola uma regra de unicidade.")
    }
    throw error
  }
}

function persist(
  data: WritableData,
  current?: repository.Despesa,
): Prisma.despesasUncheckedCreateInput | Prisma.despesasUncheckedUpdateInput {
  const valor = data.valor ?? current?.valor
  if (valor === undefined) throw new ValidationError("Valor é obrigatório.")
  return {
    ...data,
    valor: new Prisma.Decimal(valor),
  }
}

export async function createDespesa(input: unknown, companies: number[]) {
  const data = validate(createDespesaSchema, input)
  await validateRelations(
    data.id_empresa,
    data.id_categoria,
    data.id_conta_pagar,
    companies,
  )
  return write(() =>
    repository.create(persist(data) as Prisma.despesasUncheckedCreateInput),
  )
}

export async function listDespesas(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listDespesasSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}

export async function getDespesa(idInput: unknown, companies: number[]) {
  const id = validate(despesaIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Despesa não encontrada.")
  return row
}

async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  schema: typeof replaceDespesaSchema | typeof updateDespesaSchema,
  writer: typeof repository.update | typeof repository.patch,
) {
  const id = validate(despesaIdSchema, idInput)
  const data = validate(schema, input)
  const current = await repository.findById(id, companies)
  if (!current) throw new NotFoundError("Despesa não encontrada.")
  assertSituationTransition(current, data.situacao)
  const idEmpresa = data.id_empresa ?? current.id_empresa
  const idCategoria = data.id_categoria ?? current.id_categoria
  const idContaPagar =
    data.id_conta_pagar === undefined
      ? current.id_conta_pagar
      : data.id_conta_pagar
  await validateRelations(idEmpresa, idCategoria, idContaPagar, companies)
  const row = await write(() =>
    writer(
      id,
      persist(data, current) as Prisma.despesasUncheckedUpdateInput,
      companies,
    ),
  )
  if (!row) throw new NotFoundError("Despesa não encontrada.")
  return row
}

export function updateDespesa(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(
    idInput,
    input,
    companies,
    replaceDespesaSchema,
    repository.update,
  )
}

export function patchDespesa(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(
    idInput,
    input,
    companies,
    updateDespesaSchema,
    repository.patch,
  )
}

export async function deleteDespesa(idInput: unknown, companies: number[]) {
  const id = validate(despesaIdSchema, idInput)
  if (!(await repository.findById(id, companies)))
    throw new NotFoundError("Despesa não encontrada.")
  if (!(await repository.cancel(id, companies)))
    throw new NotFoundError("Despesa não encontrada.")
  return { message: "Despesa cancelada com sucesso." }
}
