import { describe, expect, it } from "vitest"
import {
  categoriaIdSchema,
  createCategoriaSchema,
  listCategoriasSchema,
  patchCategoriaSchema,
  updateCategoriaSchema,
} from "../../../modules/categorias/schema"

describe("validação de categorias", () => {
  it("normaliza espaços e aplica os padrões de criação", () => {
    expect(
      createCategoriaSchema.parse({ nome: "  Tecido \t  Plano  " }),
    ).toEqual({ nome: "Tecido Plano", descricao: null, status: "ATIVA" })
  })

  it.each(["", " ", "a", "a".repeat(101)])(
    "rejeita nome inválido: %s",
    (nome) => {
      expect(createCategoriaSchema.safeParse({ nome }).success).toBe(false)
    },
  )

  it("limita descrição e bloqueia alterações de id", () => {
    expect(
      createCategoriaSchema.safeParse({
        nome: "Tecidos",
        descricao: "x".repeat(256),
      }).success,
    ).toBe(false)
    expect(
      patchCategoriaSchema.safeParse({ id: 1, nome: "Tecidos" }).success,
    ).toBe(false)
    expect(patchCategoriaSchema.safeParse({}).success).toBe(false)
  })

  it("diferencia PUT completo de PATCH parcial", () => {
    expect(
      updateCategoriaSchema.safeParse({ descricao: "Teste" }).success,
    ).toBe(false)
    expect(patchCategoriaSchema.parse({ descricao: null })).toEqual({
      descricao: null,
    })
    expect(updateCategoriaSchema.parse({ nome: "Tecidos" })).toEqual({
      nome: "Tecidos",
      descricao: null,
      status: "ATIVA",
    })
  })

  it("valida parâmetros, paginação e ordenação com lista de campos permitidos", () => {
    expect(listCategoriasSchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      ordenar_por: "nome",
      ordem: "asc",
    })
    for (const query of [
      { page: "0" },
      { limit: "101" },
      { id_empresa: "-1" },
      { ordenar_por: "data_cadastro" },
      { ordem: "SQL" },
    ]) {
      expect(listCategoriasSchema.safeParse(query).success).toBe(false)
    }
    expect(categoriaIdSchema.safeParse("1 OR 1=1").success).toBe(false)
  })
})
