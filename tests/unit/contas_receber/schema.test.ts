import { describe, expect, it } from "vitest"
import {
  createContaReceberSchema,
  updateContaReceberSchema,
} from "../../../modules/contas_receber/schema"

const createInput = {
  id_empresa: 10,
  id_venda: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: 100,
}

describe("schemas de contas a receber", () => {
  it("aplica valores padrão e bloqueia valor_final informado pelo cliente", () => {
    const result = createContaReceberSchema.parse(createInput)
    expect(result.numero_parcela).toBe(1)
    expect(result.total_parcelas).toBe(1)
    expect(result.valor_desconto).toBe(0)
    expect(result.valor_acrescimo).toBe(0)
    expect(result.situacao).toBe("ABERTO")
    expect(() =>
      createContaReceberSchema.parse({ ...createInput, valor_final: 100 }),
    ).toThrow()
  })

  it("valida parcelas, datas e valores", () => {
    expect(() =>
      createContaReceberSchema.parse({
        ...createInput,
        numero_parcela: 2,
        total_parcelas: 1,
      }),
    ).toThrow("Número da parcela")
    expect(() =>
      createContaReceberSchema.parse({ ...createInput, valor_original: -1 }),
    ).toThrow("Valor não pode ser negativo")
    expect(() =>
      createContaReceberSchema.parse({ ...createInput, valor_original: 1.999 }),
    ).toThrow("no máximo duas casas")
    expect(() =>
      createContaReceberSchema.parse({
        ...createInput,
        data_vencimento: "2026-02-30",
      }),
    ).toThrow("Data inválida")
    expect(() => updateContaReceberSchema.parse({})).toThrow(
      "Informe pelo menos",
    )
  })
})
