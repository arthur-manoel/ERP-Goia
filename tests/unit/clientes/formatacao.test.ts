import { describe, expect, it } from "vitest"
import {
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarDocumento,
  formatarTelefone,
} from "../../../src/features/clientes/formatacao"

describe("formatação dos dados de clientes e fornecedores", () => {
  it("formata e limita CPF", () => {
    expect(formatarCpf("52998224725")).toBe("529.982.247-25")
    expect(formatarCpf("529a982b24725xyz99")).toBe("529.982.247-25")
  })

  it("formata CNPJ numérico e alfanumérico", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81")
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35")
    expect(formatarDocumento("12abc34501de35", "PJ")).toBe("12.ABC.345/01DE-35")
  })

  it("aceita somente dígitos e limita telefone com DDD", () => {
    expect(formatarTelefone("81999999999")).toBe("(81) 99999-9999")
    expect(formatarTelefone("8133334444")).toBe("(81) 3333-4444")
    expect(formatarTelefone("81abc99999999999")).toBe("(81) 99999-9999")
  })

  it("formata e limita CEP", () => {
    expect(formatarCep("50000000")).toBe("50000-000")
    expect(formatarCep("50000abc00099")).toBe("50000-000")
  })
})
