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
  contaPagarIdSchema,
  createContaPagarSchema,
  listContasPagarSchema,
  replaceContaPagarSchema,
  updateContaPagarSchema,
  type ContaPagarSituacao,
  type CreateContaPagarData,
  type ReplaceContaPagarData,
  type UpdateContaPagarData,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"

type WritableData =
  CreateContaPagarData | ReplaceContaPagarData | UpdateContaPagarData

type DatabaseSituation =
  "ABERTO" | "PAGO" | "PARCIAL" | "ATRASADO" | "CANCELADO"

function databaseSituation(situacao: ContaPagarSituacao): DatabaseSituation {
  return situacao === "VENCIDO" ? "ATRASADO" : situacao
}

function calculateFinal(
  valorOriginal: Prisma.Decimal | number,
  valorDesconto: Prisma.Decimal | number,
  valorAcrescimo: Prisma.Decimal | number,
) {
  const value = new Prisma.Decimal(valorOriginal)
    .minus(new Prisma.Decimal(valorDesconto))
    .plus(new Prisma.Decimal(valorAcrescimo))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  if (value.isNegative())
    throw new ValidationError("Valor final não pode ser negativo.")
  return value
}

function validateInstallments(numero: number, total: number) {
  if (numero > total)
    throw new ValidationError(
      "Número da parcela não pode ser maior que o total de parcelas.",
    )
}

async function validateRelations(
  idEmpresa: number,
  idCompra: number,
  idCategoria: number,
  companies: number[],
) {
  assertCompany(idEmpresa, companies)
  const [empresa, compra, categoria] = await Promise.all([
    repository.findEmpresa(idEmpresa),
    repository.findCompra(idCompra, idEmpresa),
    repository.findCategoria(idCategoria, idEmpresa),
  ])
  if (!empresa) throw new ValidationError("Empresa inexistente ou inativa.")
  if (!compra)
    throw new ValidationError("Compra inexistente para esta empresa.")
  if (!categoria)
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com despesa.",
    )
}

function persist(
  data: WritableData,
  current?: repository.ContaPagar,
):
  | Prisma.contas_pagarUncheckedCreateInput
  | Prisma.contas_pagarUncheckedUpdateInput {
  const original = new Prisma.Decimal(
    data.valor_original ?? current?.valor_original ?? 0,
  )
  const discount = new Prisma.Decimal(
    data.valor_desconto ?? current?.valor_desconto ?? 0,
  )
  const increase = new Prisma.Decimal(
    data.valor_acrescimo ?? current?.valor_acrescimo ?? 0,
  )
  const numero = data.numero_parcela ?? current?.numero_parcela ?? 1
  const total = data.total_parcelas ?? current?.total_parcelas ?? 1
  validateInstallments(numero, total)
  const { situacao, ...rest } = data
  return {
    ...rest,
    numero_parcela: numero,
    total_parcelas: total,
    valor_original: original,
    valor_desconto: discount,
    valor_acrescimo: increase,
    valor_final: calculateFinal(original, discount, increase),
    ...(situacao === undefined
      ? {}
      : { situacao: databaseSituation(situacao) }),
  }
}

function assertMutable(current: repository.ContaPagar) {
  if (current.situacao === "CANCELADO")
    throw new ConflictError("Conta cancelada não pode ser alterada.")
  if (current.situacao === "PAGO")
    throw new ConflictError("Conta paga não pode ser alterada.")
}

async function throwWriteConflict(
  id: number,
  companies: number[],
): Promise<never> {
  const latest = await repository.findById(id, companies)
  if (!latest) throw new NotFoundError("Conta a pagar não encontrada.")
  throw new ConflictError(
    "A situação da conta foi alterada por outra operação. Atualize os dados e tente novamente.",
  )
}

function toResponse(row: repository.ContaPagar) {
  return {
    ...row,
    // O banco legado usa ATRASADO; a API expõe o termo de negócio VENCIDO.
    situacao: row.situacao === "ATRASADO" ? "VENCIDO" : row.situacao,
  }
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError("Relacionamento informado não existe.")
      if (error.code === "P2002")
        throw new ConflictError("A conta a pagar viola uma regra de unicidade.")
    }
    throw error
  }
}

export async function createContaPagar(input: unknown, companies: number[]) {
  const data = validate(createContaPagarSchema, input)
  await validateRelations(
    data.id_empresa,
    data.id_compra,
    data.id_categoria,
    companies,
  )
  return toResponse(
    await write(() =>
      repository.create(
        persist(data) as Prisma.contas_pagarUncheckedCreateInput,
      ),
    ),
  )
}

export async function listContasPagar(input: unknown, companies: number[]) {
  const parsed = validate(listContasPagarSchema, input)
  assertCompany(parsed.id_empresa, companies)
  const { page, limit, situacao, ...filters } = parsed
  const result = await repository.findAll(
    {
      ...filters,
      ...(situacao === undefined
        ? {}
        : { situacao: databaseSituation(situacao) }),
    },
    { page, limit },
    companies,
  )
  return {
    rows: result.rows.map(toResponse),
    count: result.count,
    page,
    limit,
    totalPages: Math.ceil(result.count / limit),
  }
}

export async function getContaPagar(idInput: unknown, companies: number[]) {
  const id = validate(contaPagarIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Conta a pagar não encontrada.")
  return toResponse(row)
}

async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  schema: typeof replaceContaPagarSchema | typeof updateContaPagarSchema,
  writer: typeof repository.update | typeof repository.patch,
) {
  const id = validate(contaPagarIdSchema, idInput)
  const data = validate(schema, input)
  const current = await repository.findById(id, companies)
  if (!current) throw new NotFoundError("Conta a pagar não encontrada.")
  assertMutable(current)
  const idEmpresa = data.id_empresa ?? current.id_empresa
  const idCompra = data.id_compra ?? current.id_compra
  const idCategoria = data.id_categoria ?? current.id_categoria
  await validateRelations(idEmpresa, idCompra, idCategoria, companies)
  const row = await write(() =>
    writer(
      id,
      persist(data, current) as Prisma.contas_pagarUncheckedUpdateInput,
      companies,
    ),
  )
  if (!row) await throwWriteConflict(id, companies)
  return toResponse(row!)
}

export function updateContaPagar(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(
    idInput,
    input,
    companies,
    replaceContaPagarSchema,
    repository.update,
  )
}

export function patchContaPagar(
  idInput: unknown,
  input: unknown,
  companies: number[],
) {
  return update(
    idInput,
    input,
    companies,
    updateContaPagarSchema,
    repository.patch,
  )
}

export async function deleteContaPagar(idInput: unknown, companies: number[]) {
  const id = validate(contaPagarIdSchema, idInput)
  const current = await repository.findById(id, companies)
  if (!current) throw new NotFoundError("Conta a pagar não encontrada.")
  if (current.situacao === "PAGO")
    throw new ConflictError("Conta paga não pode ser cancelada.")
  if (current.situacao === "CANCELADO")
    return { message: "Conta a pagar já está cancelada." }
  if (!(await repository.cancel(id, companies)))
    await throwWriteConflict(id, companies)
  return { message: "Conta a pagar cancelada com sucesso." }
}
