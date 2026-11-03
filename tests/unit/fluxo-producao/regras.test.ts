import { describe, expect, it } from "vitest"
import {
  filtrarFluxos,
  formularioVazio,
  moverSetor,
  paraFormulario,
  paraPayload,
  setoresParaAdicionar,
  validarFormulario,
} from "@/features/fluxo-producao/regras-api"
import type { Fluxo, Setor } from "@/features/fluxo-producao/tipos"

const setor = (id: number, nome: string, ativo = true): Setor => ({
  id,
  nome,
  descricao: null,
  ativo,
})
const setores = [
  setor(1, "Sublimação"),
  setor(2, "Corte"),
  setor(3, "Costura"),
  setor(4, "Aprontamento"),
  setor(5, "Antigo", false),
]
const fluxo = (
  id: number,
  nome: string,
  ids: number[],
  ativo = true,
): Fluxo => ({
  id,
  nome,
  descricao: null,
  ativo,
  setores: ids.map((sid, i) => ({
    ...setores.find((s) => s.id === sid)!,
    ordem: i + 1,
  })),
})

describe("moverSetor", () => {
  it("troca a posição sem alterar a lista original", () => {
    const ids = [1, 2, 3, 4]
    expect(moverSetor(ids, 2, 0)).toEqual([3, 1, 2, 4])
    expect(ids).toEqual([1, 2, 3, 4])
  })
  it("ignora posições inválidas", () => {
    const ids = [1, 2]
    expect(moverSetor(ids, 0, -1)).toBe(ids)
    expect(moverSetor(ids, 1, 2)).toBe(ids)
  })
})

describe("setoresParaAdicionar", () => {
  it("só ativos, fora da sequência, em ordem alfabética", () => {
    expect(setoresParaAdicionar(setores, [2]).map((s) => s.nome)).toEqual([
      "Aprontamento",
      "Costura",
      "Sublimação",
    ])
  })
})

describe("payload e formulário", () => {
  it("apara o nome e transforma descrição vazia em null", () => {
    expect(
      paraPayload({
        nome: " Camiseta ",
        descricao: "  ",
        ativo: true,
        setores: [1, 2],
      }),
    ).toEqual({
      nome: "Camiseta",
      descricao: null,
      ativo: true,
      setores: [1, 2],
    })
  })
  it("paraFormulario usa a ordem dos setores", () => {
    const f = fluxo(9, "X", [1, 2])
    f.setores = f.setores.toReversed()
    expect(paraFormulario(f).setores).toEqual([1, 2])
  })
})

describe("validarFormulario", () => {
  const base = {
    ...formularioVazio,
    nome: "Camiseta sublimada",
    setores: [1, 2, 3, 4],
  }
  it("aceita a sequência sublimação → corte → costura → aprontamento", () => {
    const r = validarFormulario(base, setores)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.setores).toEqual([1, 2, 3, 4])
  })
  it("exige nome e ao menos um setor", () => {
    expect(validarFormulario({ ...base, nome: "  " }, setores)).toMatchObject({
      ok: false,
    })
    expect(validarFormulario({ ...base, setores: [] }, setores)).toEqual({
      ok: false,
      erro: "Adicione ao menos um setor ao fluxo.",
    })
  })
  it("recusa setor repetido, inativo ou inexistente", () => {
    expect(
      validarFormulario({ ...base, setores: [1, 1] }, setores),
    ).toMatchObject({ ok: false })
    expect(
      validarFormulario({ ...base, setores: [1, 5] }, setores),
    ).toMatchObject({ ok: false })
    expect(
      validarFormulario({ ...base, setores: [1, 99] }, setores),
    ).toMatchObject({ ok: false })
  })
  it("recusa nome e descrição acima do limite", () => {
    expect(
      validarFormulario({ ...base, nome: "a".repeat(101) }, setores),
    ).toMatchObject({ ok: false })
    expect(
      validarFormulario({ ...base, descricao: "a".repeat(256) }, setores),
    ).toMatchObject({ ok: false })
  })
})

describe("filtrarFluxos", () => {
  const lista = [
    fluxo(1, "Sublimada", [1, 2, 3, 4]),
    fluxo(2, "Básica", [2, 3], false),
  ]
  it("filtra por status", () => {
    expect(filtrarFluxos(lista, "", "ativos").map((f) => f.id)).toEqual([1])
    expect(filtrarFluxos(lista, "", "inativos").map((f) => f.id)).toEqual([2])
    expect(filtrarFluxos(lista, "", "todos")).toHaveLength(2)
  })
  it("busca por nome sem acento e por nome de setor", () => {
    expect(filtrarFluxos(lista, "basica", "todos").map((f) => f.id)).toEqual([
      2,
    ])
    expect(
      filtrarFluxos(lista, "sublimacao", "todos").map((f) => f.id),
    ).toEqual([1])
    expect(
      filtrarFluxos(lista, "aprontamento", "todos").map((f) => f.id),
    ).toEqual([1])
  })
  it("ordena por nome", () => {
    expect(filtrarFluxos(lista, "", "todos").map((f) => f.nome)).toEqual([
      "Básica",
      "Sublimada",
    ])
  })
})
