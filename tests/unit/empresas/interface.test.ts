import { expect, it, vi } from "vitest"
import {
  cadastroEmpresaSchema,
  edicaoEmpresaSchema,
  formularioEmpresa,
  payloadEmpresa,
  empresaSchema,
} from "@/features/empresas/schemas"
import {
  apiEmpresasPendente,
  normalizarEmpresas,
  queryEmpresas,
} from "@/features/empresas/api"

const form = {
  ...formularioEmpresa(),
  razao_social: " Empresa Teste ",
  cnpj: "11.222.333/0001-81",
}
const dados = cadastroEmpresaSchema.parse(payloadEmpresa(form))
const empresa = empresaSchema.parse({ id: 1, status: "ATIVA", ...dados })

it("normaliza CNPJ, contato, CEP, UF e cor conforme contrato de referência", () => {
  expect(
    cadastroEmpresaSchema.parse(
      payloadEmpresa({
        ...form,
        email: " CONTATO@EXAMPLE.TEST ",
        telefone: "(62) 99999-9999",
        cep: "74000-000",
        estado: "go",
        cor_tema: "#AABBCC",
      }),
    ),
  ).toMatchObject({
    razao_social: "Empresa Teste",
    cnpj: "11222333000181",
    email: "contato@example.test",
    telefone: "62999999999",
    cep: "74000000",
    estado: "GO",
    cor_tema: "#aabbcc",
    logo_url: null,
  })
})
it.each([
  "",
  "00000000000000",
  "11222333000182",
  "ABC22333000181",
  "11-222-333/0001-81",
])("rejeita CNPJ %s", (cnpj) => {
  expect(
    cadastroEmpresaSchema.safeParse(payloadEmpresa({ ...form, cnpj })).success,
  ).toBe(false)
})
it.each([
  "http://example.test/logo.png",
  "https://user:senha@example.test/logo",
  "javascript:alert(1)",
  "data:image/svg+xml,x",
])("rejeita logo insegura %s", (logo_url) => {
  expect(
    cadastroEmpresaSchema.safeParse(payloadEmpresa({ ...form, logo_url }))
      .success,
  ).toBe(false)
})
it.each([
  { estado: "XX" },
  { cep: "12345" },
  { telefone: "12345" },
  { email: "email inválido" },
  { cor_tema: "#fff" },
  { cor_tema: "red" },
  { razao_social: "a".repeat(151) },
  { inscricao_estadual: "x".repeat(31) },
  { numero: "x".repeat(21) },
  { logo_url: "https://example.test/" + "a".repeat(2048) },
])("valida formato e limites %#", (alteracao) => {
  expect(
    cadastroEmpresaSchema.safeParse(payloadEmpresa({ ...form, ...alteracao }))
      .success,
  ).toBe(false)
})
it("PATCH preserva campos não modificados e limpa opcionais explicitamente", () => {
  expect(payloadEmpresa(formularioEmpresa(empresa), empresa)).toEqual({})
  expect(
    edicaoEmpresaSchema.parse(
      payloadEmpresa(
        { ...formularioEmpresa(empresa), telefone: "(62) 3333-4444" },
        empresa,
      ),
    ),
  ).toEqual({ telefone: "6233334444" })
  const original = { ...empresa, email: "contato@example.test" }
  expect(
    edicaoEmpresaSchema.parse(
      payloadEmpresa({ ...formularioEmpresa(original), email: "" }, original),
    ),
  ).toEqual({ email: null })
})
it("edição de outro campo não revalida CNPJ legado ou contato não alterado", () => {
  const legado = { ...empresa, cnpj: "legado", telefone: "contato antigo" }
  expect(
    edicaoEmpresaSchema.parse(
      payloadEmpresa(
        { ...formularioEmpresa(legado), nome_fantasia: "Novo nome" },
        legado,
      ),
    ),
  ).toEqual({ nome_fantasia: "Novo nome" })
})
it("não aceita IDs ou situação dentro do formulário cadastral", () => {
  expect(edicaoEmpresaSchema.safeParse({ id: 2 }).success).toBe(false)
  expect(edicaoEmpresaSchema.safeParse({ status: "ATIVA" }).success).toBe(false)
})
it("query usa search e sortBy do PR155, sem filtro involuntário por empresa", () => {
  const query = new URLSearchParams(
    queryEmpresas({
      pagina: 2,
      limite: 10,
      busca: " Teste ",
      filtros: { cidade: "Goiânia", status: "ATIVA" },
      ordenacao: { campo: "razao_social", direcao: "desc" },
    }),
  )
  expect(Object.fromEntries(query)).toEqual({
    page: "2",
    limit: "10",
    search: "Teste",
    cidade: "Goiânia",
    status: "ATIVA",
    sortBy: "razao_social",
    sortOrder: "desc",
  })
})
it("normaliza o envelope real de paginação e rejeita respostas incompatíveis", () => {
  expect(
    normalizarEmpresas({
      success: true,
      data: { data: [], page: 1, limit: 10, total: 0, totalPages: 0 },
    }),
  ).toMatchObject({ itens: [], total: 0, totalPaginas: 1 })
  expect(() =>
    normalizarEmpresas({ success: true, data: { rows: [] } }),
  ).toThrow()
})
it("transporte pendente não faz requisições nem simula sucesso", async () => {
  const fetch = vi.fn()
  vi.stubGlobal("fetch", fetch)
  try {
    await expect(apiEmpresasPendente.criar(dados)).rejects.toThrow(
      "Nenhum dado foi gravado",
    )
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})
