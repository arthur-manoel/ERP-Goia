import { describe, expect, it } from "vitest"
import {
  LIMITES,
  excedeLimite,
  mensagemExcesso,
  tamanhoTexto,
  tetoDigitacao,
} from "./texto"
import {
  MENSAGEM_INTERVALO,
  dataIsoValida,
  erroIntervalo,
  intervaloInvertido,
} from "./datas"
import { unidadeExigeInteiro } from "../unidades"
import { erroQuantidade, validarMovimentacao } from "../movimentacao/validacao"
import { setorSchema } from "../../features/setores/schemas"
import { fluxoProducaoSchema } from "../../features/fluxo-producao/schemas"
import { pedidoSchema } from "../../features/pedidos/schemas"

describe("limite de caracteres", () => {
  it("limite exato passa; um a mais falha", () => {
    expect(excedeLimite("a".repeat(100), 100)).toBe(false)
    expect(excedeLimite("a".repeat(101), 100)).toBe(true)
  })
  it("espaços nas pontas não contam (igual ao schema)", () => {
    expect(tamanhoTexto("  abc  ")).toBe(3)
    expect(excedeLimite(" " + "a".repeat(100) + " ", 100)).toBe(false)
  })
  it("teto de digitação é maior que o limite", () => {
    expect(tetoDigitacao(255)).toBeGreaterThan(255)
  })
  it("mensagem ao vivo informa quantos remover", () => {
    expect(mensagemExcesso("a".repeat(103), 100)).toContain(
      "Remova 3 caracteres",
    )
    expect(mensagemExcesso("a".repeat(101), 100)).toContain(
      "Remova 1 caractere.",
    )
  })
})

describe("schemas de Setor e Fluxo", () => {
  const base = { type: "", description: "", status: "Ativo" as const }
  it("setor: nome no limite (100) passa, 101 falha com mensagem clara", () => {
    expect(
      setorSchema.safeParse({ ...base, name: "a".repeat(100) }).success,
    ).toBe(true)
    const r = setorSchema.safeParse({ ...base, name: "a".repeat(101) })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].message).toBe("Use no máximo 100 caracteres.")
  })
  it("setor: descrição de 10 mil caracteres é recusada, sem lançar erro", () => {
    const r = setorSchema.safeParse({
      ...base,
      name: "Corte",
      description: "x".repeat(10000),
    })
    expect(r.success).toBe(false)
  })
  it("setor: tipo vazio vira 'Outro'", () => {
    const r = setorSchema.parse({ ...base, name: "Corte" })
    expect(r.type).toBe("Outro")
  })
  it("fluxo: descrição 255 passa, 256 falha", () => {
    const f = (d: string) =>
      fluxoProducaoSchema.safeParse({
        name: "Fluxo",
        description: d,
        status: "Ativo",
        steps: [{ sectorId: "1" }],
      })
    expect(f("a".repeat(255)).success).toBe(true)
    const r = f("a".repeat(256))
    expect(r.success).toBe(false)
    expect(r.error?.issues[0].path).toEqual(["description"])
  })
})

describe("fluxo: nome alinhado ao backend (100)", () => {
  const f = (name: string) =>
    fluxoProducaoSchema.safeParse({
      name,
      description: "",
      status: "Ativo",
      steps: [{ sectorId: "1" }],
    })
  it("100 passa, 101 falha", () => {
    expect(f("a".repeat(100)).success).toBe(true)
    expect(f("a".repeat(101)).success).toBe(false)
  })
})

describe("intervalo de datas", () => {
  it("20/10/2026 → 01/10/2026 é inválido", () => {
    expect(intervaloInvertido("2026-10-20", "2026-10-01")).toBe(true)
    expect(erroIntervalo("2026-10-20", "2026-10-01")).toBe(MENSAGEM_INTERVALO)
  })
  it("datas iguais, ordem correta e vazias são válidas", () => {
    expect(erroIntervalo("2026-10-01", "2026-10-01")).toBeNull()
    expect(erroIntervalo("2026-10-01", "2026-10-20")).toBeNull()
    expect(erroIntervalo("", "2026-10-20")).toBeNull()
    expect(erroIntervalo("2026-10-20", "")).toBeNull()
  })
  it("obrigatório exige as duas", () => {
    expect(
      erroIntervalo("", "2026-10-20", { obrigatorio: true }),
    ).not.toBeNull()
  })
  it("data inexistente é rejeitada", () => {
    expect(dataIsoValida("2026-02-31")).toBe(false)
    expect(dataIsoValida("2026-02-28")).toBe(true)
  })
  it("pedido continua recusando entrega antes do pedido", () => {
    const r = pedidoSchema.safeParse({
      code: "P1",
      clientId: "1",
      date: "2026-10-20",
      dueDate: "2026-10-01",
      status: "Recebido",
      items: [{ productId: "1", quantity: 1, price: 1 }],
    })
    expect(r.success).toBe(false)
  })
})

describe("unidade inteira", () => {
  it.each(["un", "UN", "un.", "Unidade", "UND", "pç", "par", "cx", "rolo"])(
    "%s exige inteiro",
    (u) => expect(unidadeExigeInteiro(u)).toBe(true),
  )
  it.each(["kg", "m", "L", "g", "m²", "", undefined])(
    "%s aceita decimal",
    (u) => expect(unidadeExigeInteiro(u)).toBe(false),
  )
})

describe("quantidade na movimentação", () => {
  const un = { id: 1, codigo: "A", nome: "Botão", unidade: "un" }
  const kg = { id: 2, codigo: "B", nome: "Tecido", unidade: "kg" }
  const campos = (
    item: typeof un | null,
    quantidade: string,
    observacao = "",
  ) => ({
    item,
    idEstoqueOrigem: null,
    idEstoqueDestino: 1,
    quantidade,
    observacao,
  })

  it("UN com 2,5 é recusado com mensagem clara", () => {
    const r = validarMovimentacao("entrada", campos(un, "2,5"))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erros.quantidade).toMatch(/número inteiro/)
  })
  it("UN com 2 é aceito; 2,0 normaliza para 2", () => {
    const a = validarMovimentacao("entrada", campos(un, "2"))
    expect(a.ok && a.dados.quantidade).toBe("2")
    const b = validarMovimentacao("entrada", campos(un, "2,000"))
    expect(b.ok && b.dados.quantidade).toBe("2")
  })
  it("kg continua aceitando 2,5", () => {
    const r = validarMovimentacao("entrada", campos(kg, "2,5"))
    expect(r.ok && r.dados.quantidade).toBe("2.5")
  })
  it("aviso ao vivo só para unidade inteira", () => {
    expect(erroQuantidade("2,5", "un")).not.toBeNull()
    expect(erroQuantidade("2,5", "kg")).toBeNull()
    expect(erroQuantidade("2,5")).toBeNull()
    expect(erroQuantidade("")).toBeNull()
  })
  it("mensagens específicas: ponto, negativo, excesso de dígitos/casas", () => {
    expect(erroQuantidade("2.5", "kg")).toMatch(/vírgula/)
    expect(erroQuantidade("-1", "kg")).toMatch(/maior que zero/)
    expect(erroQuantidade("1".repeat(13), "kg")).toMatch(/12 dígitos/)
    expect(erroQuantidade("1,2345", "kg")).toMatch(/3 casas/)
    expect(erroQuantidade("abc", "kg")).not.toBeNull()
  })
  it("zero é recusado", () => {
    const r = validarMovimentacao("entrada", campos(kg, "0"))
    expect(r.ok).toBe(false)
  })
  it("observação: 255 passa, 256 falha, 10 mil falha", () => {
    expect(
      validarMovimentacao("entrada", campos(kg, "1", "a".repeat(255))).ok,
    ).toBe(true)
    for (const n of [256, 10000]) {
      const r = validarMovimentacao("entrada", campos(kg, "1", "a".repeat(n)))
      expect(r.ok).toBe(false)
      if (!r.ok)
        expect(r.erros.observacao).toBe(
          `Use no máximo ${LIMITES.observacaoMovimentacao} caracteres.`,
        )
    }
  })
})
