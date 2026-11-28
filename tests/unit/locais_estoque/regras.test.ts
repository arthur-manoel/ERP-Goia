import { describe, expect, it } from "vitest"
import {
  filtrarLocais,
  formularioVazio,
  paraFormulario,
  paraPatch,
  paraPayload,
} from "@/features/locais-estoque/regras"
import type { LocalEstoque } from "@/features/locais-estoque/tipos"

const local = (
  id: number,
  nome: string,
  descricao: string | null = null,
  status: LocalEstoque["status"] = "ATIVO",
): LocalEstoque => ({ id, id_empresa: 1, nome, descricao, status })

const lista = [
  local(1, "Loja", "Vitrine e balcão"),
  local(2, "Depósito central", "Galpão dos fundos"),
  local(3, "Sublimação", null, "INATIVO"),
]

describe("payload e formulário", () => {
  it("apara o nome e transforma descrição vazia em null", () => {
    expect(paraPayload({ nome: "  Loja ", descricao: "   " })).toEqual({
      nome: "Loja",
      descricao: null,
    })
  })
  it("paraFormulario devolve texto, nunca null", () => {
    expect(paraFormulario(lista[2])).toEqual({
      nome: "Sublimação",
      descricao: "",
    })
    expect(formularioVazio).toEqual({ nome: "", descricao: "" })
  })
})

describe("paraPatch", () => {
  const original = lista[0]
  it("sem mudança devolve objeto vazio", () => {
    expect(paraPatch(paraFormulario(original), original)).toEqual({})
  })
  it("envia só o campo alterado", () => {
    expect(
      paraPatch({ ...paraFormulario(original), nome: "Loja 2" }, original),
    ).toEqual({ nome: "Loja 2" })
    expect(
      paraPatch({ ...paraFormulario(original), descricao: "Nova" }, original),
    ).toEqual({ descricao: "Nova" })
  })
  it("limpar a descrição envia null", () => {
    expect(
      paraPatch({ ...paraFormulario(original), descricao: "" }, original),
    ).toEqual({ descricao: null })
  })
})

describe("filtrarLocais", () => {
  it("filtra por status", () => {
    expect(filtrarLocais(lista, "", "ativos").map((l) => l.id)).toEqual([2, 1])
    expect(filtrarLocais(lista, "", "inativos").map((l) => l.id)).toEqual([3])
    expect(filtrarLocais(lista, "", "todos")).toHaveLength(3)
  })
  it("busca sem acento no nome e na descrição", () => {
    expect(filtrarLocais(lista, "deposito", "todos").map((l) => l.id)).toEqual([
      2,
    ])
    expect(
      filtrarLocais(lista, "sublimacao", "todos").map((l) => l.id),
    ).toEqual([3])
    expect(filtrarLocais(lista, "balcao", "todos").map((l) => l.id)).toEqual([
      1,
    ])
  })
  it("ordena por nome", () => {
    expect(filtrarLocais(lista, "", "todos").map((l) => l.nome)).toEqual([
      "Depósito central",
      "Loja",
      "Sublimação",
    ])
  })
})
