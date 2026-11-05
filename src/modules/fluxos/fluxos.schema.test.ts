import { describe, expect, it } from "vitest"
import {
  editarSetorSchema,
  fluxoSchema,
  recursosSetorSchema,
  setorSchema,
} from "./fluxos.schema"

describe("schemas de setor", () => {
  it("aceita tipo opcional e remove espaços", () => {
    expect(
      setorSchema.parse({ nome: " Corte ", tipo: " Produção " }),
    ).toMatchObject({
      nome: "Corte",
      tipo: "Produção",
    })
    expect(setorSchema.parse({ nome: "Corte" }).tipo).toBeUndefined()
  })
  it("rejeita tipo vazio e campos desconhecidos", () => {
    expect(setorSchema.safeParse({ nome: "A", tipo: " " }).success).toBe(false)
    expect(setorSchema.safeParse({ nome: "A", x: 1 }).success).toBe(false)
  })
  it("edição exige ao menos um campo", () => {
    expect(editarSetorSchema.safeParse({}).success).toBe(false)
    expect(editarSetorSchema.safeParse({ ativo: false }).success).toBe(true)
  })
  it("fluxo continua sem aceitar tipo", () => {
    expect(
      fluxoSchema.safeParse({ nome: "F", tipo: "X", setores: [1] }).success,
    ).toBe(false)
  })
  it("recursos validam contra o enum e duplicidade", () => {
    expect(
      recursosSetorSchema.safeParse({ recursos: ["SETORES", "CLIENTES"] })
        .success,
    ).toBe(true)
    expect(
      recursosSetorSchema.safeParse({ recursos: ["INEXISTENTE"] }).success,
    ).toBe(false)
    expect(
      recursosSetorSchema.safeParse({ recursos: ["SETORES", "SETORES"] })
        .success,
    ).toBe(false)
    expect(recursosSetorSchema.safeParse({ recursos: [] }).success).toBe(true)
  })
})
