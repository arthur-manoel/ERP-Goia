import { Prisma } from "@/generated/prisma/client"
import { ConflictError, ValidationError } from "@/lib/api/errors"

export const LIMITE = new Prisma.Decimal("999999999999.999")
export function calcularSaldo(
  anterior: Prisma.Decimal,
  quantidade: string,
  operacao: "entrada" | "saida" | "ajuste",
  esperado?: string,
) {
  if (operacao === "ajuste" && !anterior.equals(esperado!))
    throw new ConflictError(
      "O saldo mudou. Consulte novamente antes de ajustar.",
    )
  const valor = new Prisma.Decimal(quantidade)
  const atual =
    operacao === "ajuste"
      ? valor
      : operacao === "entrada"
        ? anterior.plus(valor)
        : anterior.minus(valor)
  if (atual.isNegative())
    throw new ConflictError("Saldo insuficiente para esta saída.")
  if (atual.greaterThan(LIMITE))
    throw new ValidationError("O saldo excede a capacidade do estoque.")
  if (atual.equals(anterior))
    throw new ValidationError("O ajuste não altera o saldo.")
  return { atual, delta: atual.minus(anterior) }
}
