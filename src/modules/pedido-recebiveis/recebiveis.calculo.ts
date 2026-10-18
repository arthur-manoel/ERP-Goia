import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { dinheiro } from "@/modules/pedidos/pedidos.calculo"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import { dataCivilSchema } from "@/modules/pedidos/pedidos.schema"
import { MAX_PARCELAS } from "./recebiveis.schema"

export type ParcelaCalculada = {
  numeroParcela: number
  totalParcelas: number
  vencimento: string
  valor: Prisma.Decimal
}

export function parcelar(
  total: Prisma.Decimal,
  vencimentos: readonly string[],
): ParcelaCalculada[] {
  dinheiro(total)
  if (total.lte(0) || !total.mul(100).isInteger())
    throw new PedidoError(
      409,
      "Total do pedido incompatível com a geração financeira.",
    )
  if (
    vencimentos.length < 1 ||
    vencimentos.length > MAX_PARCELAS ||
    vencimentos.some((data) => !dataCivilSchema.safeParse(data).success)
  )
    throw new PedidoError(400, "Informe de 1 a 120 vencimentos civis válidos.")

  const centavos = total.mul(100)
  const base = centavos.divToInt(vencimentos.length)
  if (base.lte(0))
    throw new PedidoError(400, "Parcelamento produziria parcela de valor zero.")
  const residuo = centavos.minus(base.mul(vencimentos.length))
  return vencimentos.map((vencimento, indice) => ({
    numeroParcela: indice + 1,
    totalParcelas: vencimentos.length,
    vencimento,
    valor: base.plus(indice === vencimentos.length - 1 ? residuo : 0).div(100),
  }))
}
