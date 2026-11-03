import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError } from "@/lib/api/errors"
export type CreditoRecebivel = {
  valor: Prisma.Decimal
  saldo_anulado: Prisma.Decimal
  valor_restituir: Prisma.Decimal
}
/** Ajustes preservam o valor original e pagamentos; restituição não reabre cobrança. */
export function calcularCobranca(
  valorOriginal: Prisma.Decimal,
  recebido: Prisma.Decimal,
  creditos: CreditoRecebivel[] = [],
) {
  const invalido = () => {
    throw new ConflictError(
      "Cobrança, créditos ou restituição divergem do histórico. Regularização necessária.",
    )
  }
  if (valorOriginal.lt(0) || recebido.lt(0) || recebido.gt(valorOriginal))
    invalido()
  for (const c of creditos)
    if (
      c.valor.lte(0) ||
      c.saldo_anulado.lt(0) ||
      c.valor_restituir.lt(0) ||
      !c.saldo_anulado.plus(c.valor_restituir).eq(c.valor)
    )
      invalido()
  const creditado = creditos.reduce(
    (s, c) => s.plus(c.valor),
    new Prisma.Decimal(0),
  )
  const restituir = creditos.reduce(
    (s, c) => s.plus(c.valor_restituir),
    new Prisma.Decimal(0),
  )
  if (creditado.gt(valorOriginal)) invalido()
  const exigivel = valorOriginal.minus(creditado)
  const excedente = Prisma.Decimal.max(recebido.minus(exigivel), 0)
  if (!excedente.eq(restituir)) invalido()
  const saldo = Prisma.Decimal.max(exigivel.minus(recebido), 0)
  return {
    exigivel,
    creditado,
    restituir,
    saldo,
    situacao: exigivel.isZero()
      ? ("CANCELADO" as const)
      : saldo.isZero()
        ? ("PAGO" as const)
        : recebido.gt(0)
          ? ("PARCIAL" as const)
          : ("ABERTO" as const),
  }
}
