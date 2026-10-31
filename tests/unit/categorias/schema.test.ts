import { expect, it } from "vitest"
import {
  createCategoriaSchema,
  updateCategoriaSchema,
  patchCategoriaSchema,
  listCategoriasSchema,
  categoriaParamsSchema,
} from "../../../modules/categorias/schema"
import { input } from "./fixtures"

it("normaliza espaços, aplica defaults e diferencia PUT de PATCH", () => {
  expect(createCategoriaSchema.parse({ nome: " \t Malha   Lisa \n " })).toEqual(
    { nome: "Malha Lisa", descricao: null, status: "ATIVA" },
  )
  expect(updateCategoriaSchema.safeParse({ descricao: "Nova" }).success).toBe(
    false,
  )
  expect(patchCategoriaSchema.parse({ descricao: "Nova" })).toEqual({
    descricao: "Nova",
  })
})
it.each([
  { nome: " " },
  { nome: "a" },
  { nome: "a".repeat(101) },
  { descricao: "x".repeat(256) },
  { id: 1 },
  { id_empresa: null },
  { id_empresa: -1 },
  { status: "ATIVO" },
  { data_cadastro: "2026-10-28" },
])("rejeita entrada inválida %j", (data) => {
  expect(createCategoriaSchema.safeParse({ ...input, ...data }).success).toBe(
    false,
  )
  expect(patchCategoriaSchema.safeParse(data).success).toBe(false)
})
it("valida filtros, limites e parâmetros da rota", () => {
  expect(listCategoriasSchema.parse({})).toMatchObject({
    page: 1,
    limit: 20,
    ordenar_por: "nome",
    ordem: "asc",
  })
  for (const query of [
    { page: "0" },
    { limit: "101" },
    { page: "2147483647", limit: "100" },
    { ordenar_por: "data_cadastro" },
    { desconhecido: "x" },
  ])
    expect(listCategoriasSchema.safeParse(query).success).toBe(false)
  expect(categoriaParamsSchema.safeParse({ id: "1" }).success).toBe(true)
  expect(categoriaParamsSchema.safeParse({ id: "0" }).success).toBe(false)
  expect(patchCategoriaSchema.safeParse({}).success).toBe(false)
})
