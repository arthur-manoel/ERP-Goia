import { expect, it } from "vitest"
import {
  createSchema,
  updateSchema,
  patchSchema,
  filtersSchema,
  suppliersSchema,
  paginationSchema,
  paramsSchema,
} from "@/modules/empresa-fornecedor/schema"
it("POST não injeta defaults em condições omitidas, permitindo reativação sem perdas", () => {
  expect(createSchema.parse({ id_fornecedor: 5 })).toEqual({ id_fornecedor: 5 })
})
it.each([-1, 0.1, "15", Infinity, 2_147_483_648])(
  "rejeita prazo inválido %j",
  (prazo_pagamento) => {
    expect(
      createSchema.safeParse({ id_fornecedor: 5, prazo_pagamento }).success,
    ).toBe(false)
  },
)
it.each([null, 0, 15, 30])("aceita prazo em dias %j", (prazo_pagamento) => {
  expect(patchSchema.parse({ prazo_pagamento })).toEqual({ prazo_pagamento })
})
it("PUT exige todos os campos e aceita null explícito", () => {
  expect(updateSchema.safeParse({ status: "ATIVO" }).success).toBe(false)
  expect(
    updateSchema.parse({
      prazo_pagamento: null,
      prazo_entrega: 0,
      observacao: null,
      status: "INATIVO",
    }),
  ).toMatchObject({ prazo_entrega: 0 })
})
it.each(["id", "id_empresa", "id_fornecedor"])(
  "campos imutáveis não são aceitos no PATCH: %s",
  (key) => {
    expect(
      patchSchema.safeParse({ [key]: 1, observacao: "teste" }).success,
    ).toBe(false)
  },
)
it("limita observação e rejeita PATCH vazio/status inexistente", () => {
  expect(patchSchema.safeParse({ observacao: "a".repeat(256) }).success).toBe(
    false,
  )
  expect(patchSchema.safeParse({}).success).toBe(false)
  expect(patchSchema.safeParse({ status: "CANCELADO" }).success).toBe(false)
})
it.each([
  { page: "0" },
  { limit: "101" },
  { id_empresa: "10" },
  { ordenar_por: "sql" },
  { ordem: "DESC;" },
  { page: "2147483647", limit: "100" },
])("rejeita filtros %j", (input) => {
  expect(filtersSchema.safeParse(input).success).toBe(false)
})
it("paginação obrigatória por default e busca validada para fornecedores", () => {
  expect(filtersSchema.parse({})).toMatchObject({
    page: 1,
    limit: 20,
    ordenar_por: "fornecedor",
    ordem: "asc",
  })
  expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 20 })
  expect(suppliersSchema.safeParse({ id_empresa: "20" }).success).toBe(false)
  expect(paramsSchema.safeParse({ id: "1.5" }).success).toBe(false)
})
