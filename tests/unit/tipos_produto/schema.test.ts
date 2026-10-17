import assert from "node:assert/strict"
import { test } from "vitest"
import {
  createTipoProdutoSchema,
  listTiposProdutoSchema,
  replaceTipoProdutoSchema,
  tipoProdutoIdSchema,
  updateTipoProdutoSchema,
} from "../../../modules/tipos_produto/schema"

test("criação normaliza nome e aceita descrição opcional", () => {
  assert.deepEqual(
    createTipoProdutoSchema.parse({ nome: " Tipo ", descricao: " x " }),
    {
      nome: "Tipo",
      descricao: "x",
    },
  )
  assert.equal(
    createTipoProdutoSchema.safeParse({ nome: "", id: 1 }).success,
    false,
  )
})

test("PUT requer nome e limpa descrição omitida; PATCH preserva campos omitidos", () => {
  assert.deepEqual(replaceTipoProdutoSchema.parse({ nome: "Novo" }), {
    nome: "Novo",
    descricao: null,
  })
  assert.deepEqual(updateTipoProdutoSchema.parse({ descricao: null }), {
    descricao: null,
  })
  for (const value of [{}, { id: 1 }, { nome: null }])
    assert.equal(updateTipoProdutoSchema.safeParse(value).success, false)
})

test("listagem aplica paginação, limites e filtro de nome", () => {
  assert.deepEqual(listTiposProdutoSchema.parse({}), { page: 1, limit: 20 })
  assert.deepEqual(
    listTiposProdutoSchema.parse({ page: "2", limit: "10", nome: " Tipo " }),
    {
      page: 2,
      limit: 10,
      nome: "Tipo",
    },
  )
  for (const value of ["0", "-1", "1.2", "", "2147483648"])
    assert.equal(tipoProdutoIdSchema.safeParse(value).success, false)
  assert.equal(
    listTiposProdutoSchema.safeParse({ limit: "101" }).success,
    false,
  )
})
