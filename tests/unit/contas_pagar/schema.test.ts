import { expect, it } from "vitest"
import {
  createContaPagarSchema,
  updateContaPagarSchema,
  patchContaPagarSchema,
  listContasPagarSchema,
  contaPagarParamsSchema,
} from "../../../modules/contas_pagar/schema"
import { input } from "./fixtures"

it("aplica padrões e diferencia PUT completo de PATCH parcial", () => {
  const parsed = createContaPagarSchema.parse({
    ...input,
    valor_desconto: undefined,
    valor_acrescimo: undefined,
  })
  expect(parsed).toMatchObject({
    numero_parcela: 1,
    total_parcelas: 1,
    situacao: "ABERTO",
    descricao: null,
    observacao: null,
  })
  expect(parsed.valor_desconto.toString()).toBe("0")
  expect(parsed.valor_acrescimo.toString()).toBe("0")
  expect(updateContaPagarSchema.safeParse({ descricao: "Nova" }).success).toBe(
    false,
  )
  expect(patchContaPagarSchema.parse({ descricao: "Nova" })).toEqual({
    descricao: "Nova",
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
])("rejeita valor monetário inválido: %s", (value) => {
  expect(
    createContaPagarSchema.safeParse({ ...input, valor_original: value })
      .success,
  ).toBe(false)
})

it.each([
  "id",
  "valor_final",
  "saldo",
  "data_cadastro",
  "data_lancamento",
  "data_atualizacao",
])("bloqueia campo controlado pelo servidor: %s", (key) => {
  expect(createContaPagarSchema.safeParse({ ...input, [key]: 1 }).success).toBe(
    false,
  )
  expect(patchContaPagarSchema.safeParse({ [key]: 1 }).success).toBe(false)
})

it("valida parcelas, relacionamentos obrigatórios, textos e datas", () => {
  for (const data of [
    { id_compra: undefined },
    { id_categoria: null },
    { numero_parcela: 0 },
    { total_parcelas: 0 },
    { numero_parcela: 2, total_parcelas: 1 },
    { data_vencimento: "2026-02-30" },
    { descricao: "x".repeat(256) },
  ])
    expect(
      createContaPagarSchema.safeParse({ ...input, ...data }).success,
    ).toBe(false)
  expect(patchContaPagarSchema.safeParse({}).success).toBe(false)
  expect(contaPagarParamsSchema.safeParse({ id: "-1" }).success).toBe(false)
})

it("limita paginação e valida intervalos e campos de ordenação", () => {
  expect(listContasPagarSchema.parse({})).toMatchObject({
    page: 1,
    limit: 20,
    ordenar_por: "data_vencimento",
    ordem: "asc",
  })
  for (const query of [
    { page: "0" },
    { limit: "101" },
    { ordenar_por: "SQL" },
    { data_lancamento_inicio: "2026-12-01", data_lancamento_fim: "2026-11-01" },
    { data_vencimento: "2026-11-01", data_vencimento_inicio: "2026-11-01" },
    { page: "2147483647", limit: "100" },
  ])
    expect(listContasPagarSchema.safeParse(query).success).toBe(false)
})
