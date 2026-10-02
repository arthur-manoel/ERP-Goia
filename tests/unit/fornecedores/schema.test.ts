import { expect, it } from "vitest"
import {
  createFornecedorSchema,
  updateFornecedorSchema,
  listFornecedoresSchema,
} from "../../../modules/fornecedores/schema"

const input = { id_empresa: 10, razao_social: "Empresa Ltda" }
it("aplica status e deixa a data de cadastro para o banco", () => {
  expect(createFornecedorSchema.parse(input)).toEqual({
    ...input,
    status: "ATIVO",
  })
  expect(updateFornecedorSchema.parse({ nome_fantasia: null })).toEqual({
    nome_fantasia: null,
  })
})
it.each(["11.222.333/0001-81", "11222333000181", "ab.cde.f12/3456-78"])(
  "aceita e normaliza formato CNPJ %s",
  (cnpj) => {
    expect(createFornecedorSchema.parse({ ...input, cnpj }).cnpj).toBe(
      cnpj.replace(/[./-]/g, "").toUpperCase(),
    )
  },
)
it.each([
  "",
  "123",
  "11-222-333-0001-81",
  "112223330001AB",
  "112223330001810",
  "11.222.333/0001-8!",
])("rejeita formato CNPJ %s", (cnpj) => {
  expect(createFornecedorSchema.safeParse({ ...input, cnpj }).success).toBe(
    false,
  )
  expect(updateFornecedorSchema.safeParse({ cnpj }).success).toBe(false)
})
it("valida email e estado e permite limpar opcionais", () => {
  expect(
    createFornecedorSchema.safeParse({ ...input, email: "invalido" }).success,
  ).toBe(false)
  expect(updateFornecedorSchema.safeParse({ estado: "SPP" }).success).toBe(
    false,
  )
  expect(
    updateFornecedorSchema.parse({ email: null, cnpj: null, estado: "sp" }),
  ).toEqual({ email: null, cnpj: null, estado: "SP" })
  expect(
    createFornecedorSchema.parse({ ...input, email: "contato@example.com" })
      .email,
  ).toBe("contato@example.com")
})
it.each([
  {},
  { id: 1 },
  { data_cadastro: "2026-01-01" },
  { razao_social: " " },
  { id_empresa: null },
  { status: "ATIVA" },
])("rejeita atualização inválida %j", (data) => {
  expect(updateFornecedorSchema.safeParse(data).success).toBe(false)
})
it("exige empresa e razão social e respeita limites reais", () => {
  expect(
    createFornecedorSchema.safeParse({ razao_social: "Empresa" }).success,
  ).toBe(false)
  expect(createFornecedorSchema.safeParse({ id_empresa: 1 }).success).toBe(
    false,
  )
  for (const [field, max] of [
    ["razao_social", 150],
    ["nome_fantasia", 150],
    ["endereco", 255],
    ["numero", 20],
    ["complemento", 100],
    ["bairro", 100],
    ["cidade", 100],
    ["telefone", 30],
    ["cep", 10],
    ["inscricao_estadual", 30],
  ] as const) {
    expect(
      createFornecedorSchema.safeParse({ ...input, [field]: "x".repeat(max) })
        .success,
    ).toBe(true)
    expect(
      createFornecedorSchema.safeParse({
        ...input,
        [field]: "x".repeat(max + 1),
      }).success,
    ).toBe(false)
  }
})
it("aplica defaults de paginação e valida query", () => {
  expect(listFornecedoresSchema.parse({})).toEqual({ page: 1, limit: 20 })
  for (const query of [
    { page: "0" },
    { limit: "101" },
    { page: "1.2" },
    { id_empresa: "abc" },
    { status: "ATIVA" },
  ]) {
    expect(listFornecedoresSchema.safeParse(query).success).toBe(false)
  }
})
