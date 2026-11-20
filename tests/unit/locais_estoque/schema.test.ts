import { describe, expect, it } from "vitest"
import {
  createLocalSchema,
  listLocaisSchema,
  patchLocalSchema,
} from "../../../modules/locais_estoque/schema"

describe("createLocalSchema", () => {
  it("normaliza espaços e aplica os padrões", () => {
    expect(createLocalSchema.parse({ nome: "  Depósito   central " })).toEqual({
      nome: "Depósito central",
      descricao: null,
      status: "ATIVO",
    })
  })
  it("exige nome e respeita os limites", () => {
    expect(createLocalSchema.safeParse({}).success).toBe(false)
    expect(createLocalSchema.safeParse({ nome: "   " }).success).toBe(false)
    expect(createLocalSchema.safeParse({ nome: "a".repeat(101) }).success).toBe(
      false,
    )
    expect(
      createLocalSchema.safeParse({ nome: "ok", descricao: "a".repeat(256) })
        .success,
    ).toBe(false)
  })
  it("recusa campos desconhecidos e status inválido", () => {
    expect(
      createLocalSchema.safeParse({ nome: "ok", tipo: "loja" }).success,
    ).toBe(false)
    expect(
      createLocalSchema.safeParse({ nome: "ok", status: "ATIVA" }).success,
    ).toBe(false)
  })
})

describe("patchLocalSchema", () => {
  it("exige ao menos um campo e não aceita trocar a empresa", () => {
    expect(patchLocalSchema.safeParse({}).success).toBe(false)
    expect(patchLocalSchema.safeParse({ id_empresa: 2 }).success).toBe(false)
    expect(patchLocalSchema.safeParse({ status: "INATIVO" }).success).toBe(true)
    expect(patchLocalSchema.safeParse({ descricao: null }).success).toBe(true)
  })
})

describe("listLocaisSchema", () => {
  it("aplica padrões e limita a página a 100", () => {
    expect(listLocaisSchema.parse({})).toMatchObject({
      page: 1,
      limit: 20,
      ordenar_por: "nome",
      ordem: "asc",
    })
    expect(listLocaisSchema.safeParse({ limit: "101" }).success).toBe(false)
  })
  it("recusa parâmetros desconhecidos", () => {
    expect(listLocaisSchema.safeParse({ foo: "1" }).success).toBe(false)
  })
})
