import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { PedidoError } from "./pedidos.error"

const MAX_DINHEIRO = new Prisma.Decimal("9999999999999.99")
export function dinheiro(valor: Prisma.Decimal) {
  if (!valor.isFinite() || valor.lt(0) || valor.gt(MAX_DINHEIRO))
    throw new PedidoError(
      409,
      "Valor excede o limite ou é incompatível com os ajustes existentes.",
    )
  return valor
}
export function subtotal(
  quantidade: string,
  preco: string,
  desconto = "0.00",
  acrescimo = "0.00",
) {
  return dinheiro(
    new Prisma.Decimal(quantidade)
      .mul(preco)
      .minus(desconto)
      .plus(acrescimo)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
  )
}
export function total(
  itens: Prisma.Decimal[],
  desconto = "0.00",
  frete = "0.00",
  acrescimo = "0.00",
) {
  const parcial = dinheiro(
    itens.reduce((soma, v) => soma.plus(v), new Prisma.Decimal(0)),
  )
  return {
    subtotal: parcial,
    total: dinheiro(parcial.minus(desconto).plus(frete).plus(acrescimo)),
  }
}
export const dataCivil = (v: string) => new Date(v + "T00:00:00.000Z")
