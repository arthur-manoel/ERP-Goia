import { expect, it } from "vitest"
import {
  createContaReceberSchema,
  updateContaReceberSchema,
  patchContaReceberSchema,
  listContasReceberSchema,
  contaReceberParamsSchema,
} from "../../../modules/contas_receber/schema"
import { input } from "./fixtures"

it("aplica defaults, aceita centavos exatos e separa PUT de PATCH", () => {
  const parsed = createContaReceberSchema.parse({
    ...input,
    valor_desconto: undefined,
    valor_acrescimo: undefined,
  })
  expect(parsed.valor_original.toString()).toBe("100")
  expect(parsed.valor_desconto.toString()).toBe("0")
  expect(parsed.valor_acrescimo.toString()).toBe("0")
  expect(parsed).toMatchObject({
    numero_parcela: 1,
    total_parcelas: 1,
    situacao: "ABERTO",
    descricao: null,
    observacao: null,
  })
  expect(
    updateContaReceberSchema.safeParse({ observacao: "Teste" }).success,
  ).toBe(false)
  expect(patchContaReceberSchema.parse({ observacao: "Teste" })).toEqual({
    observacao: "Teste",
  })
})

it.each([
  -1,
  1.999,
  NaN,
  Infinity,
  "1.001",
  "-1",
  "1e2",
  "",
  true,
  null,
  {},
  "10000000000000",
])("rejeita dinheiro inválido: %s", (value) => {
  expect(
    createContaReceberSchema.safeParse({ ...input, valor_original: value })
      .success,
  ).toBe(false)
})

it.each([
  "id",
  "valor_final",
  "saldo",
  "id_fechamento",
  "data_cadastro",
  "data_lancamento",
  "data_atualizacao",
])("não aceita campo administrado pelo servidor: %s", (key) => {
  expect(
    createContaReceberSchema.safeParse({ ...input, [key]: 1 }).success,
  ).toBe(false)
  expect(patchContaReceberSchema.safeParse({ [key]: 1 }).success).toBe(false)
})

it("valida parcelas, tamanho dos textos e datas civis", () => {
  for (const data of [
    { numero_parcela: 0 },
    { total_parcelas: 0 },
    { numero_parcela: 2, total_parcelas: 1 },
    { data_vencimento: "2026-02-30" },
    { descricao: "x".repeat(256) },
  ])
    expect(
      createContaReceberSchema.safeParse({ ...input, ...data }).success,
    ).toBe(false)
  expect(patchContaReceberSchema.safeParse({}).success).toBe(false)
  expect(contaReceberParamsSchema.safeParse({ id: "-1" }).success).toBe(false)
})

it("valida paginação obrigatória, filtros, ordenação e períodos", () => {
  expect(listContasReceberSchema.parse({})).toMatchObject({
    page: 1,
    limit: 20,
    ordenar_por: "data_vencimento",
    ordem: "asc",
  })
  for (const data of [
    { page: "0" },
    { limit: "101" },
    { ordenar_por: "SQL" },
    { data_lancamento_inicio: "2026-12-01", data_lancamento_fim: "2026-11-01" },
    { data_vencimento: "2026-11-01", data_vencimento_inicio: "2026-11-01" },
    { page: "2147483647", limit: "100" },
  ])
    expect(listContasReceberSchema.safeParse(data).success).toBe(false)
})
