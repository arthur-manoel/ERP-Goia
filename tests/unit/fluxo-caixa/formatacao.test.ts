import { expect, it } from "vitest"
import { formatarValorCaixa } from "@/modules/fluxo-caixa/formatacao"

it.each([
  ["99999999999999.99", "R$ 99.999.999.999.999,99"],
  ["-99999999999999.99", "-R$ 99.999.999.999.999,99"],
  ["0.00", "R$ 0,00"],
  ["0.01", "R$ 0,01"],
  ["-0.01", "-R$ 0,01"],
  ["1234.56", "R$ 1.234,56"],
])("exibe %s sem perder centavos", (entrada, esperado) => {
  expect(formatarValorCaixa(entrada).replaceAll("\u00a0", " ")).toBe(esperado)
})
