import { describe, expect, it } from "vitest"
import {
  createDespesaSchema,
  updateDespesaSchema,
} from "../../../modules/despesas/schema"

const input = {
  id_empresa: 10,
  id_categoria: 20,
  descricao: "Energia elétrica",
  data_despesa: "2026-10-21",
  valor: 120.5,
}

describe("schemas de despesas", () => {
  it("aplica valores padrão e rejeita campos imutáveis", () => {
    const result = createDespesaSchema.parse(input)
    expect(result.id_conta_pagar).toBeNull()
    expect(result.situacao).toBe("ABERTA")
    expect(() => createDespesaSchema.parse({ ...input, id: 1 })).toThrow()
  })

  it("valida valores, datas e atualização vazia", () => {
    expect(() => createDespesaSchema.parse({ ...input, valor: 0 })).toThrow(
      "Valor deve ser maior que zero",
    )
    expect(() => createDespesaSchema.parse({ ...input, valor: 1.999 })).toThrow(
      "duas casas",
    )
    expect(() =>
      createDespesaSchema.parse({ ...input, data_despesa: "2026-02-30" }),
    ).toThrow("Data inválida")
    expect(() => updateDespesaSchema.parse({})).toThrow("Informe pelo menos")
  })
})
