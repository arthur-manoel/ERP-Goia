import { expect, it } from "vitest"
import {
  createOrdemSchema,
  updateOrdemSchema,
  patchOrdemSchema,
  listOrdemSchema,
  decimalSchema,
  ordemParamsSchema,
} from "../../../src/modules/producao/ordem.schema"
it("aplica defaults apenas no cadastro; PATCH preserva campos ausentes", () => {
  expect(createOrdemSchema.parse({ numero: " OP-1 " })).toMatchObject({
    numero: "OP-1",
    quantidade_planejada: "0",
    prioridade: "NORMAL",
    data_inicio: null,
  })
  expect(patchOrdemSchema.parse({ observacao: " Revisão " })).toEqual({
    observacao: "Revisão",
  })
  expect(updateOrdemSchema.safeParse({ numero: "OP-1" }).success).toBe(false)
})
it.each(["", " ", "x".repeat(51)])("rejeita número inválido %j", (numero) => {
  expect(createOrdemSchema.safeParse({ numero }).success).toBe(false)
})
it.each(["-1", "1.0001", "1000000000000", "1e3", "NaN", -1, Infinity])(
  "rejeita quantidade %j",
  (quantidade_planejada) => {
    expect(decimalSchema.safeParse(quantidade_planejada).success).toBe(false)
  },
)
it("aceita a precisão máxima sem converter para number", () => {
  expect(decimalSchema.parse("999999999999.999")).toBe("999999999999.999")
})
it.each([
  "id",
  "id_usuario",
  "id_empresa",
  "status",
  "data_conclusao",
  "data_cadastro",
  "data_atualizacao",
])('PATCH rejeita campo protegido "%s"', (key) => {
  expect(
    patchOrdemSchema.safeParse({ observacao: "teste", [key]: 1 }).success,
  ).toBe(false)
})
it.each([
  {},
  { page: "0" },
  { limit: "101" },
  { ordenar_por: "sql" },
  { ordem: "random" },
  { data_inicio_de: "2026-02-30" },
  { data_previsao_de: "2026-03-02", data_previsao_ate: "2026-03-01" },
])("valida filtros %j", (input) => {
  expect(listOrdemSchema.safeParse(input).success).toBe(
    Object.keys(input).length === 0,
  )
})
it.each(["0", "-1", "1.1", "2147483648", "1e1"])("rejeita ID %s", (id) => {
  expect(ordemParamsSchema.safeParse({ id }).success).toBe(false)
})
