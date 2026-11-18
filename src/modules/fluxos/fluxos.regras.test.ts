import { describe, expect, it } from "vitest"
import { ehInativacao } from "./fluxos.regras"

describe("ehInativacao (5.3)", () => {
  it("só a transição ATIVO → INATIVO conta", () => {
    expect(ehInativacao("ATIVO", false)).toBe(true)
  })
  it("editar setor inativo reenviando ativo:false não é inativação", () => {
    expect(ehInativacao("INATIVO", false)).toBe(false)
  })
  it("sem ativo, reativação e criação não são inativação", () => {
    expect(ehInativacao("ATIVO", undefined)).toBe(false)
    expect(ehInativacao("INATIVO", true)).toBe(false)
    expect(ehInativacao(undefined, false)).toBe(false)
  })
})
