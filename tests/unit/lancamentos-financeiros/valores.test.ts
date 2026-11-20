import { expect, it } from "vitest"
import { totalLiquido } from "@/modules/lancamentos-financeiros/valores"

it("preserva centavos quando o agregado cresce além da precisão padrão do Decimal", () => {
  const entrada = "1000000000000000000.01"
  const saida = "1000000000000000000.00"
  expect(totalLiquido(entrada, saida)).toBe("0.01")
  expect(totalLiquido(entrada, saida, "100.00")).toBe("100.01")
  expect(totalLiquido(saida, entrada, "0.00")).toBe("-0.01")
})
