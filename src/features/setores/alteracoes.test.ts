import { describe, expect, it } from "vitest"
import { montarAlteracoes } from "./alteracoes"
import { normalizarSetores } from "./fonte"
import type { SetorApi } from "./tipos"

const inativo: SetorApi = {
  id: 7,
  nome: "Costura",
  tipo: "Produção",
  descricao: null,
  ativo: false,
  recursos: [],
}
const valores = { nome: "Costura", tipo: "Produção", descricao: "" }

describe("montarAlteracoes (5.3)", () => {
  it("renomear setor inativo envia só o nome, nunca ativo:false", () => {
    const alt = montarAlteracoes(inativo, { ...valores, nome: "  Costura 2 " })
    expect(alt).toEqual({ nome: "Costura 2" })
    expect("ativo" in alt).toBe(false)
  })
  it("sem mudanças não há payload", () => {
    expect(montarAlteracoes(inativo, valores)).toEqual({})
  })
  it("limpar descrição envia null; mudar tipo envia só o tipo", () => {
    const comDescricao = { ...inativo, descricao: "x" }
    expect(
      montarAlteracoes(comDescricao, { ...valores, descricao: " " }),
    ).toEqual({ descricao: null })
    expect(montarAlteracoes(inativo, { ...valores, tipo: "Apoio" })).toEqual({
      tipo: "Apoio",
    })
  })
})

describe("normalizarSetores", () => {
  const meta = {
    permissoes: { ler: true, criar: false, editar: true, excluir: false },
    administrador: false,
  }
  const paginacao = { pagina: 1, limite: 10, total: 1, totalPaginas: 1 }
  it("aceita o contrato real da API", () => {
    const r = normalizarSetores({
      setores: [{ ...inativo, extra: 1 }],
      paginacao,
      ...meta,
    })
    expect(r.itens).toHaveLength(1)
    expect(r.meta.permissoes.excluir).toBe(false)
  })
  it("rejeita corpo sem permissões ou com item inválido", () => {
    expect(() => normalizarSetores({ setores: [inativo], paginacao })).toThrow()
    expect(() =>
      normalizarSetores({ setores: [{ id: "a" }], paginacao, ...meta }),
    ).toThrow()
  })
})
