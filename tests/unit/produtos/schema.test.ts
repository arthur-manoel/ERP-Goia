import assert from "node:assert/strict"
import { test } from "vitest"
import {
  createProdutoSchema,
  updateProdutoSchema,
  listProdutosSchema,
  produtoIdSchema,
} from "../../../modules/produtos/schema"

const input = {
  id_empresa: 10,
  codigo: " P001 ",
  nome: "Produto",
  id_tipo_produto: 1,
  unidade: "UN",
  controla_estoque: 1,
  permite_compra: 0,
  permite_producao: 0,
  permite_venda: 1,
}

test("criação aplica status e converte os flags para Boolean do Prisma", () => {
  const data = createProdutoSchema.parse(input)
  assert.equal(data.codigo, "P001")
  assert.equal(data.status, "ATIVO")
  assert.equal(data.controla_estoque, true)
  assert.equal(data.permite_compra, false)
  assert.equal("data_cadastro" in data, false)
})

test("criação rejeita flags inválidos, campos faltantes e campos administrados pelo banco", () => {
  for (const value of [true, "0", 2, null, undefined]) {
    assert.equal(
      createProdutoSchema.safeParse({ ...input, permite_venda: value }).success,
      false,
    )
  }
  for (const field of ["codigo", "nome", "id_tipo_produto", "unidade"]) {
    assert.equal(
      createProdutoSchema.safeParse({ ...input, [field]: undefined }).success,
      false,
    )
  }
  assert.equal(
    createProdutoSchema.safeParse({ ...input, id: 1 }).success,
    false,
  )
  assert.equal(
    createProdutoSchema.safeParse({ ...input, data_cadastro: "2026-01-01" })
      .success,
    false,
  )
})

test("PUT parcial não aplica defaults, permite limpar opcionais e bloqueia campos imutáveis", () => {
  assert.deepEqual(updateProdutoSchema.parse({ nome: "Novo" }), {
    nome: "Novo",
  })
  assert.deepEqual(
    updateProdutoSchema.parse({ id_categoria: null, descricao: null }),
    {
      id_categoria: null,
      descricao: null,
    },
  )
  for (const data of [
    {},
    { codigo: "P002" },
    { id: 2 },
    { nome: null },
    { status: "OUTRO" },
  ]) {
    assert.equal(updateProdutoSchema.safeParse(data).success, false)
  }
})

test("listagem aplica paginação e valida filtros e inteiros estritamente", () => {
  assert.deepEqual(listProdutosSchema.parse({}), { page: 1, limit: 20 })
  assert.deepEqual(
    listProdutosSchema.parse({ page: "2", limit: "10", id_categoria: "3" }),
    {
      page: 2,
      limit: 10,
      id_categoria: 3,
    },
  )
  for (const page of ["0", "-1", "1.5", "", "1e2", "2147483648"]) {
    assert.equal(listProdutosSchema.safeParse({ page }).success, false)
    assert.equal(produtoIdSchema.safeParse(page).success, false)
  }
  assert.equal(listProdutosSchema.safeParse({ limit: "101" }).success, false)
  assert.equal(listProdutosSchema.safeParse({ status: "OUTRO" }).success, false)
  assert.equal(listProdutosSchema.safeParse({ unknown: "x" }).success, false)
})

test("limites de texto correspondem aos varchar do schema Prisma atual", () => {
  for (const [field, limit] of [
    ["codigo", 100],
    ["nome", 150],
    ["descricao", 255],
    ["unidade", 20],
  ] as const) {
    assert.equal(
      createProdutoSchema.safeParse({ ...input, [field]: "x".repeat(limit) })
        .success,
      true,
    )
    assert.equal(
      createProdutoSchema.safeParse({
        ...input,
        [field]: "x".repeat(limit + 1),
      }).success,
      false,
    )
    if (field !== "codigo") {
      assert.equal(
        updateProdutoSchema.safeParse({ [field]: "x".repeat(limit + 1) })
          .success,
        false,
      )
    }
  }
  assert.equal(
    listProdutosSchema.safeParse({ codigo: "x".repeat(101) }).success,
    false,
  )
})
