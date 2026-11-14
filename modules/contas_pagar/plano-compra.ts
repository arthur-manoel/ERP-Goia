import { Prisma } from "../../src/generated/prisma/client"
import { ConflictError, ValidationError } from "../../src/lib/api/errors"
import type { FinancialActor } from "../financeiro/auditoria"
import * as repository from "./repository"

export function dividirPlano(total: string, vencimentos: string[]) {
  const valor = new Prisma.Decimal(total)
  const centavos = valor.times(100)
  if (
    !centavos.isInteger() ||
    !vencimentos.length ||
    centavos.lt(vencimentos.length)
  )
    throw new ValidationError(
      "O total deve permitir parcelas positivas em centavos.",
    )
  const base = centavos.div(vencimentos.length).floor()
  const residuo = centavos.minus(base.times(vencimentos.length))
  return {
    valorTotal: valor.toFixed(2),
    parcelas: vencimentos.map((vencimento, i) => ({
      numero: i + 1,
      vencimento,
      valor: (i === vencimentos.length - 1 ? base.plus(residuo) : base)
        .div(100)
        .toFixed(2),
    })),
  }
}

export async function prepararPlanoCompra(
  tx: repository.Database,
  idEmpresa: number,
  idCategoria: number,
  total: string,
  vencimentos: string[],
) {
  if (!(await repository.findCategoria(idCategoria, idEmpresa, tx)))
    throw new ValidationError(
      "Categoria financeira inexistente, inativa ou incompatível com despesa nesta empresa.",
    )
  return dividirPlano(total, vencimentos)
}

type Actor = FinancialActor & { idEmpresa: number }

export async function gerarPlanoCompra(
  tx: repository.Database,
  actor: Actor,
  idCompra: number,
  idCategoria: number,
  plano: ReturnType<typeof dividirPlano>,
) {
  const criado = await tx.planos_pagamento_compra.create({
    data: {
      id_empresa: actor.idEmpresa,
      id_compra: idCompra,
      id_categoria: idCategoria,
      id_usuario: actor.idUsuario,
      valor_total: plano.valorTotal,
      vencimentos: plano.parcelas.map((parcela) => parcela.vencimento),
    },
  })
  for (const parcela of plano.parcelas) {
    const conta = await repository.create(
      {
        id_empresa: actor.idEmpresa,
        id_compra: idCompra,
        id_categoria: idCategoria,
        id_plano_pagamento: criado.id,
        numero_parcela: parcela.numero,
        total_parcelas: plano.parcelas.length,
        data_vencimento: new Date(`${parcela.vencimento}T00:00:00.000Z`),
        valor_original: parcela.valor,
        valor_final: parcela.valor,
        situacao: "ABERTO",
      },
      tx,
    )
    await repository.auditFinancial(
      tx,
      actor,
      "contas_pagar",
      null,
      conta,
      "CRIACAO",
    )
  }
  await repository.auditFinancial(
    tx,
    actor,
    "planos_pagamento_compra",
    null,
    criado,
    "CRIACAO",
  )
}

export async function cancelarPlanoCompra(
  tx: repository.Database,
  actor: Actor,
  idCompra: number,
) {
  const where = { id_empresa: actor.idEmpresa, id_compra: idCompra }
  const plano = await tx.planos_pagamento_compra.findUnique({
    where: { id_empresa_id_compra: where },
  })
  // Bloqueia também inserções concorrentes de pagamentos pela FK da parcela.
  const titulos = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM contas_pagar
    WHERE id_empresa = ${actor.idEmpresa} AND id_compra = ${idCompra}
    ORDER BY id FOR UPDATE
  `
  for (const { id } of titulos) {
    const conta = await repository.findById(id, [actor.idEmpresa], tx)
    if (!conta)
      throw new ConflictError(
        "Uma parcela foi alterada durante o cancelamento.",
      )
    if (
      conta.situacao === "PAGO" ||
      conta.situacao === "PARCIAL" ||
      (await repository.countPayments(id, tx)) ||
      (await repository.countPaidExpenses(id, tx))
    )
      throw new ConflictError(
        "A compra possui pagamentos ou baixas vinculadas.",
      )
    if (conta.situacao === "CANCELADO") continue
    if (!plano || conta.id_plano_pagamento !== plano.id)
      throw new ConflictError(
        "A compra possui títulos legados ativos. Concilie os registros antes de cancelar.",
      )
    const cancelada = await repository.cancel(id, [actor.idEmpresa], tx)
    await repository.auditFinancial(
      tx,
      actor,
      "contas_pagar",
      conta,
      cancelada,
      "CANCELAMENTO",
    )
  }
  if (plano && !plano.data_cancelamento) {
    const cancelado = await tx.planos_pagamento_compra.update({
      where: { id: plano.id },
      data: { data_cancelamento: new Date() },
    })
    await repository.auditFinancial(
      tx,
      actor,
      "planos_pagamento_compra",
      plano,
      cancelado,
      "CANCELAMENTO",
    )
  }
}
