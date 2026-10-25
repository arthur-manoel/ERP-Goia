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
import type { FinancialActor, FinancialEvent } from "../financeiro/auditoria"
import {
  contaReceberIdSchema,
  createContaReceberSchema,
  updateContaReceberSchema,
  patchContaReceberSchema,
  listContasReceberSchema,
  type CreateContaReceberData,
  type PatchContaReceberData,
} from "./schema"

export {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../src/lib/api/errors"
type Situation = CreateContaReceberData["situacao"]
const toDatabaseSituation = (value: Situation) =>
  value === "VENCIDO" ? ("ATRASADO" as const) : value

function toResponse(row: repository.ContaReceber) {
  return {
    ...row,
    situacao: row.situacao === "ATRASADO" ? "VENCIDO" : row.situacao,
  }
}

function calculate(
  data: Pick<
    CreateContaReceberData,
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
  current?: repository.ContaReceber,
) {
  if (
    ["PAGO", "PARCIAL"].includes(requested) &&
    requested !== current?.situacao
  )
    throw new ConflictError(
      "Baixa exige pagamento, saldo e movimentação na mesma transação. Fluxo de recebimento ainda não disponível.",
    )
}

function isClosedSale(
  venda: NonNullable<Awaited<ReturnType<typeof repository.findVenda>>>,
) {
  return (
    venda._count.pedido_cliente_fechamento > 0 ||
    (venda.pedido_cliente?._count.pedido_cliente_fechamento ?? 0) > 0 ||
    venda.pedido_cliente?.status === "CONCLUIDO"
  )
}

function assertManualSale(
  venda: NonNullable<Awaited<ReturnType<typeof repository.findVenda>>>,
) {
  if (isClosedSale(venda))
    throw new ConflictError(
      "Venda de pedido fechado não permite títulos manuais adicionais nem alteração do plano financeiro.",
    )
  if (venda.status === "CANCELADA" || venda.status_financeiro === "CANCELADA")
    throw new ConflictError(
      "Venda cancelada não permite esta operação financeira.",
    )
}

async function validateRelations(
  data: Pick<
    CreateContaReceberData,
    "id_empresa" | "id_venda" | "id_categoria"
  >,
  companies: number[],
  database: repository.Database,
) {
  assertCompany(data.id_empresa, companies)
  const [empresa, venda, categoria] = await Promise.all([
    repository.findEmpresa(data.id_empresa, database),
    repository.findVenda(data.id_venda, data.id_empresa, database),
    repository.findCategoria(data.id_categoria, data.id_empresa, database),
  ])
  if (!empresa) throw new ValidationError("Empresa inexistente ou inativa.")
  if (!venda) throw new ValidationError("Venda inexistente para esta empresa.")
  if (!categoria)
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com receita nesta empresa.",
    )
  return venda
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
        throw new NotFoundError("Conta a receber não encontrada.")
      if (error.code === "P2000")
        throw new ValidationError("Um dos campos excede o tamanho permitido.")
    }
    throw error
  }
}

export async function createContaReceber(
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const data = validate(createContaReceberSchema, input)
  assertCompany(data.id_empresa, companies)
  noDirectSettlement(data.situacao)
  const final = calculate(data)
  return write(() =>
    repository.withWriteLock([data.id_empresa], async (database) => {
      if (data.situacao === "CANCELADO")
        await assertCanCancel(actor, [data.id_empresa], database)
      const venda = await validateRelations(data, companies, database)
      assertManualSale(venda)
      const row = await repository.create(
        {
          ...data,
          situacao: toDatabaseSituation(data.situacao),
          valor_final: final,
          saldo: final,
        },
        database,
      )
      await repository.auditFinancial(
        database,
        actor,
        "contas_receber",
        null,
        row,
        "CRIACAO",
      )
      return toResponse(row)
    }),
  )
}

async function save(
  id: number,
  payload: Prisma.contas_receberUncheckedUpdateInput,
  companies: number[],
  database: repository.Database,
  actor: FinancialActor,
  current: repository.ContaReceber,
  partial: boolean,
  total = current.valor_final,
  event: FinancialEvent = "EDICAO",
) {
  const confirmed = await repository.confirmedPayments(id, database)
  const received = confirmed._sum.valor ?? new Prisma.Decimal(0)
  if (
    confirmed._count._all > 0 &&
    (await repository.invalidConfirmedMovements(
      id,
      current.id_empresa,
      database,
    ))
  )
    throw new ConflictError(
      "Pagamento confirmado sem movimentação financeira correspondente exige regularização antes da reconciliação.",
    )
  if (
    confirmed._count._all > 0 &&
    (confirmed._min.id_empresa !== current.id_empresa ||
      confirmed._max.id_empresa !== current.id_empresa ||
      confirmed._min.valor === null ||
      confirmed._min.valor.lte(0))
  )
    throw new ConflictError(
      "Pagamentos confirmados inconsistentes com a empresa ou valor do título.",
    )
  if (received.lt(0) || received.gt(total))
    throw new ConflictError(
      "Recebimentos confirmados excedem o valor devido. Regularize os pagamentos antes da alteração.",
    )
  const saldo = total.minus(received)
  let situacao =
    typeof payload.situacao === "string" ? payload.situacao : current.situacao
  if (situacao === "CANCELADO" && received.gt(0))
    throw new ConflictError(
      "Conta com recebimentos precisa de estorno antes do cancelamento.",
    )
  if (current.situacao === "PAGO" && saldo.gt(0))
    throw new ConflictError(
      "Conta paga com saldo em aberto exige regularização; não pode ser reaberta automaticamente.",
    )
  if (current.situacao === "PARCIAL" && received.isZero())
    throw new ConflictError(
      "Conta parcial sem pagamentos confirmados exige regularização.",
    )
  // Não cria pagamentos nem aceita baixa declarada pelo cliente: apenas
  // reconcilia o título com evidências de pagamentos já confirmados no banco.
  if (received.gt(0)) situacao = saldo.isZero() ? "PAGO" : "PARCIAL"
  if (situacao === "CANCELADO" && current.situacao !== "CANCELADO")
    event = "CANCELAMENTO"
  else if (
    situacao !== current.situacao &&
    ["PAGO", "PARCIAL"].includes(situacao)
  )
    event = "BAIXA"
  else if (
    event === "EDICAO" &&
    (current.saldo === null || !current.saldo.eq(saldo))
  )
    event = "RECONCILIACAO"
  const data = { ...payload, saldo, situacao }
  const after = partial
    ? await repository.patch(id, data, companies, database)
    : await repository.update(id, data, companies, database)
  await repository.auditFinancial(
    database,
    actor,
    "contas_receber",
    current,
    after,
    event,
  )
  return toResponse(after)
}

export async function listContasReceber(input: unknown, companies: number[]) {
  const { page, limit, situacao, ...filters } = validate(
    listContasReceberSchema,
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

export async function getContaReceber(idInput: unknown, companies: number[]) {
  const id = validate(contaReceberIdSchema, idInput)
  const row = await repository.findById(id, companies)
  if (!row) throw new NotFoundError("Conta a receber não encontrada.")
  return toResponse(row)
}

function hasFinancialChanges(
  data: PatchContaReceberData,
  current: repository.ContaReceber,
) {
  for (const key of [
    "id_empresa",
    "id_venda",
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
  const id = validate(contaReceberIdSchema, idInput)
  const data = partial
    ? validate(patchContaReceberSchema, input)
    : validate(updateContaReceberSchema, input)
  assertCompany(data.id_empresa, companies)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Conta a receber não encontrada.")
      if (data.situacao === "CANCELADO" && current.situacao !== "CANCELADO")
        await assertCanCancel(
          actor,
          [current.id_empresa, data.id_empresa ?? current.id_empresa],
          database,
        )
      if (data.situacao) noDirectSettlement(data.situacao, current)
      const changed = hasFinancialChanges(data, current)
      const payments = await repository.countPayments(id, database)
      const immutable =
        current.id_fechamento !== null ||
        ["PAGO", "PARCIAL", "CANCELADO"].includes(current.situacao) ||
        payments > 0
      if (changed && immutable)
        throw new ConflictError(
          "Recebível de pedido fechado, pago, parcial, cancelado ou com pagamentos não permite alterar vencimento, valores, parcelas, vínculos ou situação.",
        )
      const metadata = {
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.observacao !== undefined
          ? { observacao: data.observacao }
          : {}),
      }
      // Metadados de títulos protegidos não recalculam valores do plano fechado.
      if (immutable)
        return save(id, metadata, companies, database, actor, current, true)
      const originalSale = await repository.findVenda(
        current.id_venda,
        current.id_empresa,
        database,
      )
      if (!originalSale)
        throw new ValidationError("Venda inexistente para esta empresa.")
      if (isClosedSale(originalSale)) {
        if (changed) assertManualSale(originalSale)
        return save(id, metadata, companies, database, actor, current, true)
      }
      const effective = { ...current, ...data }
      const venda = await validateRelations(effective, companies, database)
      if (isClosedSale(venda)) {
        if (changed) assertManualSale(venda)
        return save(id, metadata, companies, database, actor, current, true)
      }
      assertManualSale(venda)
      if (effective.numero_parcela > effective.total_parcelas)
        throw new ValidationError(
          "Número da parcela não pode ser maior que o total de parcelas.",
        )
      // Metadados e valores monetários equivalentes não reprecificam títulos
      // históricos. Recalcular somente quando um componente monetário mudar.
      const monetaryChanged = (
        ["valor_original", "valor_desconto", "valor_acrescimo"] as const
      ).some((key) => data[key] !== undefined && !data[key].eq(current[key]))
      const final = monetaryChanged ? calculate(effective) : current.valor_final
      const { situacao, ...fields } = data
      const payload: Prisma.contas_receberUncheckedUpdateInput = {
        ...fields,
        ...(monetaryChanged ? { valor_final: final } : {}),
        ...(situacao ? { situacao: toDatabaseSituation(situacao) } : {}),
      }
      return save(
        id,
        payload,
        companies,
        database,
        actor,
        current,
        partial,
        final,
      )
    }),
  )
}

export const updateContaReceber = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, false, actor)
export const patchContaReceber = (
  id: unknown,
  input: unknown,
  companies: number[],
  actor: FinancialActor,
) => update(id, input, companies, true, actor)

export async function deleteContaReceber(
  idInput: unknown,
  companies: number[],
  actor: FinancialActor,
) {
  const id = validate(contaReceberIdSchema, idInput)
  return write(() =>
    repository.withWriteLock(companies, async (database) => {
      const current = await repository.findForUpdate(id, companies, database)
      if (!current) throw new NotFoundError("Conta a receber não encontrada.")
      await assertCanCancel(actor, [current.id_empresa], database)
      if (
        current.id_fechamento !== null ||
        ["PAGO", "PARCIAL"].includes(current.situacao) ||
        (await repository.countPayments(id, database)) > 0
      )
        throw new ConflictError(
          "Recebível de pedido fechado ou com recebimentos não pode ser cancelado por esta API.",
        )
      const venda = await repository.findVenda(
        current.id_venda,
        current.id_empresa,
        database,
      )
      if (!venda)
        throw new ValidationError("Venda inexistente para esta empresa.")
      assertManualSale(venda)
      if (current.situacao !== "CANCELADO")
        await save(
          id,
          { situacao: "CANCELADO" },
          companies,
          database,
          actor,
          current,
          true,
          current.valor_final,
          "CANCELAMENTO",
        )
      return { message: "Conta a receber cancelada com sucesso." }
    }),
  )
}
