import { Prisma } from "../../src/generated/prisma/client"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
import { validate } from "../../src/lib/api/http"
import { disputaPersistencia } from "../../src/lib/prisma-concorrencia"
import { assertCompany } from "../catalogos/access"
import { assertCanCancel } from "../financeiro/access"
import type { FinancialActor } from "../financeiro/auditoria"
import * as repository from "./repository"
import {
  createDespesaSchema,
  updateDespesaSchema,
  patchDespesaSchema,
  listDespesasSchema,
  despesaIdSchema,
  type CreateDespesaData,
  type PatchDespesaData,
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
        "Conflito concorrente ou de unicidade. Consulte os dados e tente novamente.",
      )
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003")
        throw new ValidationError("Relacionamento inexistente ou incompatível.")
      if (error.code === "P2025")
        throw new NotFoundError("Despesa não encontrada.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}
function noDirectSettlement(
  situacao: string | undefined,
  current?: repository.Despesa,
) {
  if (situacao === "PAGA" && current?.situacao !== "PAGA")
    throw new ConflictError(
      "Baixa exige pagamento e movimentação na mesma transação. Não é permitido marcar a despesa como paga pelo cadastro.",
    )
}
async function validateRelations(
  data: Pick<
    CreateDespesaData,
    "id_empresa" | "id_categoria" | "id_conta_pagar"
  >,
  companies: number[],
  database: repository.Database,
) {
  assertCompany(data.id_empresa, companies)
  const [empresa, categoria] = await Promise.all([
    repository.findEmpresa(data.id_empresa, database),
    repository.findCategoria(data.id_categoria, data.id_empresa, database),
  ])
  if (!empresa) throw new ValidationError("Empresa inexistente ou inativa.")
  if (!categoria)
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com despesa nesta empresa.",
    )
  if (data.id_conta_pagar !== null) {
    const account = await repository.findContaPagar(
      data.id_conta_pagar,
      data.id_empresa,
      database,
    )
    if (!account)
      throw new ValidationError("Conta a pagar inexistente para esta empresa.")
    if (account.situacao === "CANCELADO")
      throw new ConflictError(
        "Não é permitido associar despesa a conta a pagar cancelada.",
      )
  }
}
export async function createDespesa(
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const data = validate(createDespesaSchema, input)
  assertCompany(data.id_empresa, companies)
  noDirectSettlement(data.situacao)
  return write(() =>
    repository.withWriteLock([data.id_empresa], async (database) => {
      if (data.situacao === "CANCELADA")
        await assertCanCancel(actor, [data.id_empresa], database)
      await validateRelations(data, companies, database)
      const after = await repository.create(data, database)
      await repository.auditFinancial(
        database,
        actor,
        "despesas",
        null,
        after,
        "CRIACAO",
      )
      return after
    }),
  )
}
export async function listDespesas(input: unknown, companies: number[]) {
  const { page, limit, ...filters } = validate(listDespesasSchema, input)
  assertCompany(filters.id_empresa, companies)
  const result = await repository.findAll(filters, { page, limit }, companies)
  return { ...result, page, limit, totalPages: Math.ceil(result.count / limit) }
}
export async function getDespesa(idInput: unknown, companies: number[]) {
  const row = await repository.findById(
    validate(despesaIdSchema, idInput),
    companies,
  )
  if (!row) throw new NotFoundError("Despesa não encontrada.")
  return row
}
function hasFinancialChanges(
  data: PatchDespesaData,
  current: repository.Despesa,
) {
  for (const key of [
    "id_empresa",
    "id_categoria",
    "id_conta_pagar",
    "situacao",
  ] as const)
    if (data[key] !== undefined && data[key] !== current[key]) return true
  return (
    (data.valor !== undefined && !data.valor.eq(current.valor)) ||
    (data.data_despesa !== undefined &&
      data.data_despesa.getTime() !== current.data_despesa.getTime())
  )
}
async function update(
  idInput: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
  partial: boolean,
) {
  const id = validate(despesaIdSchema, idInput)
  const data = partial
    ? validate(patchDespesaSchema, input)
    : validate(updateDespesaSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Despesa não encontrada.")
      if (data.situacao === "CANCELADA" && current.situacao !== "CANCELADA")
        await assertCanCancel(
          actor,
          [current.id_empresa, data.id_empresa ?? current.id_empresa],
          database,
        )
      noDirectSettlement(data.situacao, current)
      const changed = hasFinancialChanges(data, current)
      const movements = await repository.countMovements(id, database)
      const frozen = current.situacao !== "ABERTA" || movements > 0
      if (changed && frozen)
        throw new ConflictError(
          "Despesa paga, cancelada ou com movimentações exige fluxo de estorno para alterações financeiras ou cancelamento.",
        )
      const metadata = {
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.observacao !== undefined
          ? { observacao: data.observacao }
          : {}),
      }
      if (!frozen && changed)
        await validateRelations({ ...current, ...data }, companies, database)
      const payload = frozen ? metadata : data
      const after = partial
        ? await repository.patch(id, payload, companies, database)
        : await repository.update(id, payload, companies, database)
      await repository.auditFinancial(
        database,
        actor,
        "despesas",
        current,
        after,
        current.situacao !== "CANCELADA" && after.situacao === "CANCELADA"
          ? "CANCELAMENTO"
          : "EDICAO",
      )
      return after
    }),
  )
}
export const updateDespesa = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, actor, false)
export const patchDespesa = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, actor, true)
export async function deleteDespesa(
  idInput: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const id = validate(despesaIdSchema, idInput)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Despesa não encontrada.")
      await assertCanCancel(actor, [current.id_empresa], database)
      if (
        current.situacao === "PAGA" ||
        (await repository.countMovements(id, database)) > 0
      )
        throw new ConflictError(
          "Despesa paga ou com movimentações exige estorno consistente antes de cancelamento.",
        )
      if (current.situacao !== "CANCELADA") {
        const after = await repository.cancel(id, companies, database)
        await repository.auditFinancial(
          database,
          actor,
          "despesas",
          current,
          after,
          "CANCELAMENTO",
        )
      }
      return { message: "Despesa cancelada com sucesso." }
    }),
  )
}
