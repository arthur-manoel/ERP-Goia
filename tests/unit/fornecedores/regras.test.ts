import { describe, expect, it } from "vitest"
import {
  filtrarFornecedores,
  formatarCnpj,
  normalizarCnpj,
  paraPayload,
  formularioVazio,
} from "@/features/fornecedores/regras"
import type { Fornecedor } from "@/features/fornecedores/tipos"

const base: Fornecedor = {
  id: 1,
  id_empresa: 10,
  razao_social: "Alfa Tecidos Ltda",
  nome_fantasia: null,
  cnpj: null,
  inscricao_estadual: null,
  endereco: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  cep: null,
  telefone: null,
  email: null,
  status: "ATIVO",
}
const comMascara = { ...base, id: 2, cnpj: "11.222.333/0001-81" }
const semMascara = { ...base, id: 3, cnpj: "11222333000199" }
const lista = [base, comMascara, semMascara]

describe("filtrarFornecedores", () => {
  it.each(["11.222.333/0001-81", "11222333000181", "0001-81"])(
    "acha o registro com CNPJ formatado pelo termo %s",
    (termo) => {
      expect(filtrarFornecedores(lista, termo).map((f) => f.id)).toEqual([2])
    },
  )
  it("trecho comum devolve todos os CNPJs que o contêm", () => {
    expect(filtrarFornecedores(lista, "333/0001").map((f) => f.id)).toEqual([
      2, 3,
    ])
  })
  it("acha registro sem máscara digitando com máscara", () => {
    expect(
      filtrarFornecedores(lista, "11.222.333/0001-99").map((f) => f.id),
    ).toEqual([3])
  })
  it("ignora maiúsculas no CNPJ alfanumérico", () => {
    const alfa = { ...base, id: 4, cnpj: "AB.CDE.F12/3456-78" }
    expect(filtrarFornecedores([alfa], "abcdef12").map((f) => f.id)).toEqual([
      4,
    ])
  })
  it("pontuação sozinha não casa com todos os CNPJs", () => {
    expect(filtrarFornecedores([comMascara], "./-")).toEqual([])
    expect(filtrarFornecedores([semMascara], "zzz")).toEqual([])
  })
  it("busca por razão social e devolve tudo sem termo", () => {
    expect(filtrarFornecedores(lista, "alfa")).toHaveLength(3)
    expect(filtrarFornecedores(lista, "  ")).toBe(lista)
  })
})

describe("cnpj e payload", () => {
  it("normaliza e formata", () => {
    expect(normalizarCnpj(" 11.222.333/0001-81 ")).toBe("11222333000181")
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81")
    expect(formatarCnpj(null)).toBe("—")
  })
  it("vazio vira null e id_empresa só na criação", () => {
    const criar = paraPayload({ ...formularioVazio, razaoSocial: " X " }, 10)
    expect(criar).toMatchObject({
      id_empresa: 10,
      razao_social: "X",
      cnpj: null,
      email: null,
      estado: null,
    })
    expect(paraPayload(formularioVazio)).not.toHaveProperty("id_empresa")
  })
})
