import "server-only"
import { Prisma } from "@/generated/prisma/client"

// O acumulado de até INT_MAX movimentos DECIMAL(15,2) cabe em 25 dígitos.
const DecimalLivro = Prisma.Decimal.clone({ precision: 30 })

export function totalLiquido(
  entradas: string,
  saidas: string,
  saldoInicial = "0.00",
) {
  return new DecimalLivro(saldoInicial).plus(entradas).minus(saidas).toFixed(2)
}
