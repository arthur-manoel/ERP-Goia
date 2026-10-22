import { describe, expect, it } from "vitest"
import {
  createContaPagarSchema,
  updateContaPagarSchema,
} from "../../../modules/contas_pagar/schema"

const createInput = {
  id_empresa: 10,
  id_compra: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: 100,
}

describe("schemas de contas a pagar", () => {
  it("aplica valores padrão e bloqueia valor_final informado pelo cliente", () => {
    const result = createContaPagarSchema.parse(createInput)
    expect(result.numero_parcela).toBe(1)
    expect(result.total_parcelas).toBe(1)
    expect(result.valor_desconto).toBe(0)
    expect(result.valor_acrescimo).toBe(0)
    expect(result.situacao).toBe("ABERTO")
    expect(() =>
      createContaPagarSchema.parse({ ...createInput, valor_final: 100 }),
    ).toThrow()
  })

  it("valida parcelas, datas e valores", () => {
    expect(() =>
      createContaPagarSchema.parse({
        ...createInput,
        numero_parcela: 2,
        total_parcelas: 1,
      }),
    ).toThrow("Número da parcela")
    expect(() =>
      createContaPagarSchema.parse({ ...createInput, valor_original: -1 }),
    ).toThrow("Valor não pode ser negativo")
    expect(() =>
      createContaPagarSchema.parse({
        ...createInput,
        data_vencimento: "2026-02-30",
      }),
    ).toThrow("Data inválida")
    expect(() => updateContaPagarSchema.parse({})).toThrow("Informe pelo menos")
  })
})
