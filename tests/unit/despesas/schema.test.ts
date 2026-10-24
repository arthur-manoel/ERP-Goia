import { expect, it } from "vitest"
import {
  createDespesaSchema,
  updateDespesaSchema,
  patchDespesaSchema,
  listDespesasSchema,
} from "../../../modules/despesas/schema"
const input = {
  id_empresa: 10,
  id_categoria: 30,
  descricao: " Energia ",
  data_despesa: "2026-10-24",
  valor: "100.01",
}
it("valida defaults e separa PUT completo de PATCH parcial", () => {
  const parsed = createDespesaSchema.parse(input)
  expect(parsed).toMatchObject({
    descricao: "Energia",
    id_conta_pagar: null,
    observacao: null,
    situacao: "ABERTA",
  })
  expect(parsed.valor.toString()).toBe("100.01")
  expect(updateDespesaSchema.safeParse({ observacao: "Nova" }).success).toBe(
    false,
  )
  expect(patchDespesaSchema.parse({ observacao: "Nova" })).toEqual({
    observacao: "Nova",
  })
})
it.each([
  0,
  -1,
  1.001,
  "0",
  "-1",
  "0.0001",
  true,
  null,
  "1e2",
  "10000000000000",
])("rejeita valor inválido %s", (valor) => {
  expect(createDespesaSchema.safeParse({ ...input, valor }).success).toBe(false)
})
it("bloqueia datas inválidas, textos fora dos limites e campos administrados", () => {
  for (const data of [
    { descricao: " " },
    { descricao: "x".repeat(256) },
    { data_despesa: "2026-02-30" },
    { id: 1 },
    { data_cadastro: "2026-01-01" },
    { id_usuario: 999 },
  ])
    expect(createDespesaSchema.safeParse({ ...input, ...data }).success).toBe(
      false,
    )
  expect(patchDespesaSchema.safeParse({}).success).toBe(false)
})
it("limita páginas, ordenação e períodos", () => {
  expect(listDespesasSchema.parse({})).toMatchObject({
    page: 1,
    limit: 20,
    ordenar_por: "data_despesa",
    ordem: "desc",
  })
  for (const query of [
    { limit: "101" },
    { page: "0" },
    { ordenar_por: "SQL" },
    { data_cadastro_inicio: "2026-12-01", data_cadastro_fim: "2026-11-01" },
  ])
    expect(listDespesasSchema.safeParse(query).success).toBe(false)
})
