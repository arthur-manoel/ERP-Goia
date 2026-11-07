import { describe, expect, it } from "vitest"
import {
  formatarMilesimos,
  milesimos,
  quantidadeDaEntrega,
} from "../../../src/features/reservas/quantidades"

describe("quantidades do formulário de estoque", () => {
  it.each(["", "  ", "0", "0,000", "0.0"])("omite o campo %j", (valor) => {
    expect(quantidadeDaEntrega(valor)).toEqual({ tipo: "omitida" })
  })
  it.each([
    "abc",
    "2abc",
    "-1",
    "1,2,3",
    "1.234,5",
    "1e2",
    "0,0001",
    "1000000000000",
    "00",
  ])("rejeita o campo preenchido %j", (valor) =>
    expect(quantidadeDaEntrega(valor)).toEqual({ tipo: "invalida" }),
  )
  it("normaliza somente uma quantidade decimal completa", () => {
    expect(quantidadeDaEntrega(" 0,100 ")).toEqual({
      tipo: "valida",
      quantidade: "0.100",
    })
  })
  it("mantém comparações e somatórios exatos até o limite da coluna", () => {
    expect(milesimos("0.300") - milesimos("0.200")).toBe(milesimos("0.100"))
    expect(milesimos("0.100") + milesimos("0.200")).toBe(milesimos("0.300"))
    expect(milesimos("1.000") - milesimos("0.999")).toBe(milesimos("0.001"))
    expect(milesimos("0.101") > milesimos("0.300") - milesimos("0.200")).toBe(
      true,
    )
    const limite = milesimos("999999999999.999")
    expect(formatarMilesimos(limite + milesimos("0.001"))).toBe(
      "1.000.000.000.000,000",
    )
  })
})
