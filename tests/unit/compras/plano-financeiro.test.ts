import { describe, expect, it } from "vitest"
import { dividirPlano } from "../../../modules/contas_pagar/plano-compra"
import { acaoCompraSchema } from "@/modules/compras/compras.schema"

describe("plano financeiro da compra", () => {
  const datas = ["2026-12-05", "2027-01-05", "2027-02-05"]
  it.each([
    [1, ["100.00"]],
    [2, ["50.00", "50.00"]],
    [3, ["33.33", "33.33", "33.34"]],
  ] as const)("divide em %s parcela(s) com soma exata", (n, valores) => {
    const plano = dividirPlano("100.00", datas.slice(0, n))
    expect(plano.parcelas.map((p) => p.valor)).toEqual(valores)
  })

  it.each(["0.02", "-100.00", "1.001", "0"])(
    "rejeita total inválido %s",
    (total) => expect(() => dividirPlano(total, datas)).toThrow(),
  )

  it.each([[], ["2026-02-30"], [datas[0], datas[0]]])(
    "rejeita vencimentos inválidos",
    (...vencimentos) => {
      expect(
        acaoCompraSchema.safeParse({
          acao: "confirmar",
          idCategoria: 1,
          vencimentos,
        }).success,
      ).toBe(false)
    },
  )

  it("rejeita um total fornecido pelo cliente", () => {
    expect(
      acaoCompraSchema.safeParse({
        acao: "confirmar",
        idCategoria: 1,
        vencimentos: datas,
        valorTotal: 99,
      }).success,
    ).toBe(false)
  })
})
