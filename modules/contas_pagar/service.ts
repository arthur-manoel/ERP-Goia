import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { disputaPersistencia } from "../../src/lib/prisma-concorrencia"
import { validate } from "../../src/lib/api/http"
import { assertCompany } from "../catalogos/access"
import { assertCanCancel } from "../financeiro/access"
import * as repository from "./repository"
import type { FinancialActor } from "../financeiro/auditoria"
import {
  contaPagarIdSchema,
  createContaPagarSchema,
  updateContaPagarSchema,
  patchContaPagarSchema,
  listContasPagarSchema,
  type CreateContaPagarData,
  type PatchContaPagarData,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
type Situation = CreateContaPagarData["situacao"]
const toDatabaseSituation = (value: Situation) =>
  value === "VENCIDO" ? ("ATRASADO" as const) : value
function toResponse(row: repository.ContaPagar) {
  return {
    ...row,
    situacao: row.situacao === "ATRASADO" ? "VENCIDO" : row.situacao,
  }
}

function calculate(
  data: Pick<
    CreateContaPagarData,
    "valor_original" | "valor_desconto" | "valor_acrescimo"
  >,
) {
  const result = data.valor_original
    .minus(data.valor_desconto)
    .plus(data.valor_acrescimo)
  if (result.lt(0))
    throw new ValidationError("Valor final não pode ser negativo.")
  if (result.gt("9999999999999.99"))
    throw new ValidationError("Valor final excede DECIMAL(15,2).")
  return result
}

function noDirectSettlement(
  requested: Situation,
  current?: repository.ContaPagar,
) {
  if (
    ["PAGO", "PARCIAL"].includes(requested) &&
    requested !== current?.situacao
  )
    throw new ConflictError(
      "Baixa exige pagamento e movimentação na mesma transação. Fluxo de pagamento ainda não disponível.",
    )
}

async function validateRelations(
  data: Pick<CreateContaPagarData, "id_empresa" | "id_compra" | "id_categoria">,
  companies: number[],
  database: repository.Database,
) {
  assertCompany(data.id_empresa, companies)
  const [empresa, compra, categoria] = await Promise.all([
    repository.findEmpresa(data.id_empresa, database),
    repository.findCompra(data.id_compra, data.id_empresa, database),
    repository.findCategoria(data.id_categoria, data.id_empresa, database),
  ])
  if (!empresa) throw new ValidationError("Empresa inexistente ou inativa.")
  if (!compra)
    throw new ValidationError("Compra inexistente para esta empresa.")
  if (!categoria)
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com despesa nesta empresa.",
    )
  if (compra.status === "CANCELADA")
    throw new ConflictError(
      "Compra cancelada não permite criar ou alterar obrigações financeiras.",
    )
}

async function write<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Conflito concorrente ou de unicidade. Consulte os dados e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError(
          "Relacionamento informado não existe ou é incompatível.",
        )
      if (error.code === "P2025")
        throw new NotFoundError("Conta a pagar não encontrada.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}

export async function createContaPagar(
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const data = validate(createContaPagarSchema, input)
  assertCompany(data.id_empresa, companies)
  noDirectSettlement(data.situacao)
  const final = calculate(data)
  return write(() =>
    repository.withWriteLock([data.id_empresa], async (database) => {
      if (data.situacao === "CANCELADO")
        await assertCanCancel(actor, [data.id_empresa], database)
      await validateRelations(data, companies, database)
      const after = await repository.create(
        {
          ...data,
          situacao: toDatabaseSituation(data.situacao),
          valor_final: final,
        },
        database,
      )
      await repository.auditFinancial(
        database,
        actor,
        "contas_pagar",
        null,
        after,
        "CRIACAO",
      )
      return toResponse(after)
    }),
  )
}

export async function listContasPagar(input: unknown, companies: number[]) {
  const { page, limit, situacao, ...filters } = validate(
    listContasPagarSchema,
    input,
  )
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(
    {
      ...filters,
      ...(situacao ? { situacao: toDatabaseSituation(situacao) } : {}),
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

function hasFinancialChanges(
  data: PatchContaPagarData,
  current: repository.ContaPagar,
) {
  for (const key of [
    "id_empresa",
    "id_compra",
    "id_categoria",
    "numero_parcela",
    "total_parcelas",
  ] as const)
    if (data[key] !== undefined && data[key] !== current[key]) return true
  for (const key of [
    "valor_original",
    "valor_desconto",
    "valor_acrescimo",
  ] as const)
    if (data[key] !== undefined && !data[key].eq(current[key])) return true
  if (
    data.data_vencimento &&
    data.data_vencimento.getTime() !== current.data_vencimento.getTime()
  )
    return true
  return (
    data.situacao !== undefined &&
    toDatabaseSituation(data.situacao) !== current.situacao
  )
}

async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  partial: boolean,
  actor: FinancialActor,
) {
  const id = validate(contaPagarIdSchema, idInput)
  const data = partial
    ? validate(patchContaPagarSchema, input)
    : validate(updateContaPagarSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      // Nenhum valor é lido/calculado antes de adquirir o lock da conta.
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Conta a pagar não encontrada.")
      if (data.situacao === "CANCELADO" && current.situacao !== "CANCELADO")
        await assertCanCancel(
          actor,
          [current.id_empresa, data.id_empresa ?? current.id_empresa],
          database,
        )
      if (data.situacao) noDirectSettlement(data.situacao, current)
      const changed = hasFinancialChanges(data, current)
      const payments = await repository.countPayments(id, database)
      const paidExpenses = await repository.countPaidExpenses(id, database)
      const immutable =
        ["PAGO", "PARCIAL", "CANCELADO"].includes(current.situacao) ||
        payments > 0 ||
        paidExpenses > 0
      if (changed && immutable)
        throw new ConflictError(
          "Conta paga, parcial, cancelada ou com pagamentos não permite alterar valores, vencimento, parcelas, vínculos ou situação.",
        )
      const metadata = {
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.observacao !== undefined
          ? { observacao: data.observacao }
          : {}),
      }
      if (immutable) {
        const after = await repository.patch(id, metadata, companies, database)
        await repository.auditFinancial(
          database,
          actor,
          "contas_pagar",
          current,
          after,
          "EDICAO",
        )
        return toResponse(after)
      }
      if (
        data.id_empresa !== undefined &&
        data.id_empresa !== current.id_empresa &&
        (await repository.countLinkedExpenses(id, database)) > 0
      )
        throw new ConflictError(
          "Conta com despesas vinculadas não pode ser transferida para outra empresa.",
        )
      const effective = { ...current, ...data }
      await validateRelations(effective, companies, database)
      if (effective.numero_parcela > effective.total_parcelas)
        throw new ValidationError(
          "Número da parcela não pode ser maior que o total de parcelas.",
        )
      const final = calculate(effective)
      const { situacao, ...fields } = data
      const payload: Prisma.contas_pagarUncheckedUpdateInput = {
        ...fields,
        valor_final: final,
        ...(situacao ? { situacao: toDatabaseSituation(situacao) } : {}),
      }
      const row = partial
        ? await repository.patch(id, payload, companies, database)
        : await repository.update(id, payload, companies, database)
      await repository.auditFinancial(
        database,
        actor,
        "contas_pagar",
        current,
        row,
        row.situacao === "CANCELADO" && current.situacao !== "CANCELADO"
          ? "CANCELAMENTO"
          : "EDICAO",
      )
      return toResponse(row)
    }),
  )
}

export const updateContaPagar = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, false, actor)
export const patchContaPagar = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, true, actor)

export async function deleteContaPagar(
  idInput: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const id = validate(contaPagarIdSchema, idInput)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Conta a pagar não encontrada.")
      await assertCanCancel(actor, [current.id_empresa], database)
      if (
        ["PAGO", "PARCIAL"].includes(current.situacao) ||
        (await repository.countPayments(id, database)) > 0 ||
        (await repository.countPaidExpenses(id, database)) > 0
      )
        throw new ConflictError(
          "Conta paga, parcial ou com pagamentos não pode ser cancelada por esta API.",
        )
      if (current.situacao !== "CANCELADO") {
        const after = await repository.cancel(id, companies, database)
        await repository.auditFinancial(
          database,
          actor,
          "contas_pagar",
          current,
          after,
          "CANCELAMENTO",
        )
      }
      return { message: "Conta a pagar cancelada com sucesso." }
    }),
  )
}
