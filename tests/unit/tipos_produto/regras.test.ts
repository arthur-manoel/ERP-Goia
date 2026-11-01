import { describe, expect, it } from "vitest"
import {
  filtrarTiposProduto,
  formularioVazio,
  paraFormulario,
  paraPayload,
} from "@/features/tipos-produto/regras"
import type { TipoProduto } from "@/features/tipos-produto/tipos"

const tipo = (id: number, nome: string, descricao: string | null = null) =>
  ({ id, nome, descricao, status: "ATIVO" }) satisfies TipoProduto

const lista = [
  tipo(1, "Insumo", "Matéria-prima e aviamentos"),
  tipo(2, "Produto acabado", "Itens prontos para venda"),
  tipo(3, "Café da manhã"),
]

describe("filtrarTiposProduto", () => {
  it("sem termo devolve a lista inteira", () => {
    expect(filtrarTiposProduto(lista, "   ")).toBe(lista)
  })
  it("busca no nome ignorando maiúsculas", () => {
    expect(filtrarTiposProduto(lista, "INSUMO").map((t) => t.id)).toEqual([1])
  })
  it("busca na descrição", () => {
    expect(filtrarTiposProduto(lista, "venda").map((t) => t.id)).toEqual([2])
  })
  it("ignora acentos nos dois lados", () => {
    expect(filtrarTiposProduto(lista, "cafe").map((t) => t.id)).toEqual([3])
    expect(filtrarTiposProduto(lista, "materia").map((t) => t.id)).toEqual([1])
  })
  it("não quebra com descrição nula", () => {
    expect(filtrarTiposProduto(lista, "zzz")).toEqual([])
  })
})

describe("payload e formulário", () => {
  it("apara o nome e transforma descrição vazia em null", () => {
    expect(paraPayload({ nome: "  Insumo ", descricao: "   " })).toEqual({
      nome: "Insumo",
      descricao: null,
    })
    expect(paraPayload(formularioVazio)).toEqual({ nome: "", descricao: null })
  })
  it("preenche o formulário de edição", () => {
    expect(paraFormulario(tipo(3, "Café da manhã"))).toEqual({
      nome: "Café da manhã",
      descricao: "",
    })
  })
})
