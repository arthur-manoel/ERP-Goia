import { describe, expect, it } from "vitest"
import {
  chaveAcessoValida,
  deEscala,
  paraEscala,
  proximoStatus,
  quantidadePendente,
  somarValores,
  statusPedidoAposRecebimento,
  totalItem,
  transicoesCompra,
  transicoesPedido,
  transicoesRequisicao,
} from "@/modules/compras/compras.regras"
import {
  criarCompraSchema,
  criarNotaSchema,
  criarPedidoSchema,
  criarRequisicaoSchema,
  listarPedidosSchema,
  receberCompraSchema,
} from "@/modules/compras/compras.schema"

/** DV calculado de forma independente (pesos 2..9 da direita p/ esquerda) para montar chaves de teste. */
function chaveComDv(base43: string) {
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9]
  const soma = [...base43]
    .reverse()
    .reduce((t, d, i) => t + Number(d) * pesos[i % 8], 0)
  const resto = soma % 11
  return base43 + String(resto < 2 ? 0 : 11 - resto)
}
const BASE = "3526091234567800019555001000000123100000456"

describe("aritmÃ©tica decimal exata", () => {
  it("converte e rejeita formatos invÃ¡lidos", () => {
    expect(paraEscala("12.5", 3)).toBe(BigInt(12500))
    expect(paraEscala(100, 3)).toBe(BigInt(100000))
    for (const ruim of [
      "-1",
      "1e3",
      "1,5",
      "",
      " ",
      "abc",
      "1.2345",
      "0x10",
      "+1",
    ])
      expect(paraEscala(ruim, 3)).toBeNull()
    expect(paraEscala("1234567890123", 3)).toBeNull() // estoura Decimal(15,3)
  })
  it("calcula totais do exemplo da especificaÃ§Ã£o", () => {
    expect(totalItem("100", "15.00")).toBe("1500.00")
    expect(totalItem("50", "8")).toBe("400.00")
    expect(somarValores(["1500.00", "400.00"])).toBe("1900.00")
  })
  it("arredonda meio-para-cima sem erro de float", () => {
    expect(totalItem("0.500", "0.01")).toBe("0.01") // 0,005 â†’ 0,01
    expect(totalItem("3", "0.10")).toBe("0.30") // em float seria 0.30000000000000004
    expect(totalItem("1.333", "10.00")).toBe("13.33")
    expect(deEscala(BigInt(5), 2)).toBe("0.05")
  })
  it("calcula pendente sem ficar negativo", () => {
    expect(quantidadePendente("100.000", "60.000")).toBe("40.000")
    expect(quantidadePendente("100.000", "100.000")).toBe("0.000")
    expect(quantidadePendente("10.000", "12.000")).toBe("0.000")
  })
})

describe("mÃ¡quinas de estado", () => {
  it("solicitaÃ§Ã£o: sÃ³ segue o fluxo previsto e nunca vai a ATENDIDA por aÃ§Ã£o direta", () => {
    expect(proximoStatus(transicoesRequisicao, "enviar", "RASCUNHO")).toBe(
      "ABERTA",
    )
    expect(proximoStatus(transicoesRequisicao, "aprovar", "ABERTA")).toBe(
      "APROVADA",
    )
    expect(
      proximoStatus(transicoesRequisicao, "aprovar", "RASCUNHO"),
    ).toBeNull()
    expect(
      proximoStatus(transicoesRequisicao, "cancelar", "ATENDIDA"),
    ).toBeNull()
    for (const acao of Object.keys(transicoesRequisicao))
      for (const alvo of Object.values(transicoesRequisicao[acao]))
        expect(alvo).not.toBe("ATENDIDA")
  })
  it("pedido e compra", () => {
    expect(proximoStatus(transicoesPedido, "emitir", "RASCUNHO")).toBe(
      "EMITIDO",
    )
    expect(proximoStatus(transicoesPedido, "cancelar", "RECEBIDO")).toBeNull()
    expect(proximoStatus(transicoesCompra, "receber", "EMITIDA")).toBe(
      "ENTREGUE",
    )
    expect(proximoStatus(transicoesCompra, "receber", "ENTREGUE")).toBeNull()
    expect(proximoStatus(transicoesCompra, "cancelar", "ENTREGUE")).toBeNull()
  })
  it("pedido fica PARCIAL enquanto houver quantidade pendente", () => {
    expect(
      statusPedidoAposRecebimento([{ pedida: "100.000", recebida: "60" }]),
    ).toBe("PARCIAL")
    expect(
      statusPedidoAposRecebimento([{ pedida: "100.000", recebida: "100" }]),
    ).toBe("RECEBIDO")
    expect(
      statusPedidoAposRecebimento([
        { pedida: "10.000", recebida: "10" },
        { pedida: "5.000", recebida: "0.000" },
      ]),
    ).toBe("PARCIAL")
  })
})

describe("chave de acesso da NF-e", () => {
  it("aceita chave com DV correto e rejeita erro de digitaÃ§Ã£o", () => {
    const chave = chaveComDv(BASE)
    expect(chaveAcessoValida(chave)).toBe(true)
    const errada =
      chave.slice(0, 10) +
      (chave[10] === "9" ? "8" : String(Number(chave[10]) + 1)) +
      chave.slice(11)
    expect(chaveAcessoValida(errada)).toBe(false)
  })
  it("rejeita tamanho errado, letras e repetiÃ§Ãµes", () => {
    expect(chaveAcessoValida("123")).toBe(false)
    expect(chaveAcessoValida("A".repeat(44))).toBe(false)
    expect(chaveAcessoValida("0".repeat(44))).toBe(false)
  })
})

describe("validaÃ§Ã£o de entrada (zod)", () => {
  const item = { idProduto: 1, quantidade: "10" }
  it("solicitaÃ§Ã£o: quantidade zero/negativa e lista vazia sÃ£o recusadas", () => {
    expect(criarRequisicaoSchema.safeParse({ itens: [item] }).success).toBe(
      true,
    )
    expect(
      criarRequisicaoSchema.safeParse({ itens: [{ ...item, quantidade: 0 }] })
        .success,
    ).toBe(false)
    expect(
      criarRequisicaoSchema.safeParse({
        itens: [{ ...item, quantidade: "-5" }],
      }).success,
    ).toBe(false)
    expect(
      criarRequisicaoSchema.safeParse({
        itens: [{ ...item, quantidade: "1.2345" }],
      }).success,
    ).toBe(false)
    expect(criarRequisicaoSchema.safeParse({ itens: [] }).success).toBe(false)
  })
  it("solicitaÃ§Ã£o: item sem insumo, insumo repetido e campos estranhos sÃ£o recusados", () => {
    expect(
      criarRequisicaoSchema.safeParse({ itens: [{ quantidade: "1" }] }).success,
    ).toBe(false)
    expect(
      criarRequisicaoSchema.safeParse({ itens: [item, item] }).success,
    ).toBe(false)
    expect(
      criarRequisicaoSchema.safeParse({ itens: [item], idEmpresa: 9 }).success,
    ).toBe(false)
  })
  it("pedido: valor unitÃ¡rio nÃ£o pode ser negativo e total nÃ£o Ã© aceito na entrada", () => {
    const base = {
      idFornecedor: 3,
      itens: [{ ...item, valorUnitario: "15.00" }],
    }
    expect(criarPedidoSchema.safeParse(base).success).toBe(true)
    expect(
      criarPedidoSchema.safeParse({
        ...base,
        itens: [{ ...item, valorUnitario: "-1" }],
      }).success,
    ).toBe(false)
    expect(
      criarPedidoSchema.safeParse({ ...base, valorTotal: "1" }).success,
    ).toBe(false)
    expect(
      criarPedidoSchema.safeParse({
        ...base,
        itens: [{ ...base.itens[0], valorTotal: "1" }],
      }).success,
    ).toBe(false)
  })
  it("compra: de pedido herda dados; manual exige fornecedor e itens", () => {
    expect(
      criarCompraSchema.safeParse({ idPedidoCompra: 1, idLocalEstoque: 2 })
        .success,
    ).toBe(true)
    expect(
      criarCompraSchema.safeParse({
        idPedidoCompra: 1,
        idFornecedor: 3,
        idLocalEstoque: 2,
      }).success,
    ).toBe(false)
    expect(criarCompraSchema.safeParse({ idLocalEstoque: 2 }).success).toBe(
      false,
    )
    expect(
      criarCompraSchema.safeParse({
        idFornecedor: 3,
        idLocalEstoque: 2,
        itens: [{ ...item, valorUnitario: "1" }],
      }).success,
    ).toBe(true)
  })
  it("recebimento: quantidade recebida deve ser positiva", () => {
    expect(
      receberCompraSchema.safeParse({
        itens: [{ idProduto: 1, quantidade: "60" }],
      }).success,
    ).toBe(true)
    expect(
      receberCompraSchema.safeParse({
        itens: [{ idProduto: 1, quantidade: "0" }],
      }).success,
    ).toBe(false)
  })
  it("nota fiscal: normaliza e valida chave; exige nÃºmero/sÃ©rie numÃ©ricos", () => {
    const chave = chaveComDv(BASE)
    const nota = {
      numero: "12345",
      serie: "1",
      chaveAcesso: `${chave.slice(0, 4)} ${chave.slice(4)}`,
      idFornecedor: 1,
      valorTotal: "100.50",
    }
    const ok = criarNotaSchema.safeParse(nota)
    expect(ok.success && ok.data.chaveAcesso).toBe(chave)
    expect(
      criarNotaSchema.safeParse({ ...nota, chaveAcesso: "1".repeat(44) })
        .success,
    ).toBe(false)
    expect(criarNotaSchema.safeParse({ ...nota, numero: "12a" }).success).toBe(
      false,
    )
    expect(
      criarNotaSchema.safeParse({ ...nota, valorTotal: "-3" }).success,
    ).toBe(false)
  })
  it("filtros: perÃ­odo invertido e parÃ¢metros desconhecidos sÃ£o recusados", () => {
    expect(
      listarPedidosSchema.safeParse({ de: "2026-02-01", ate: "2026-01-01" })
        .success,
    ).toBe(false)
    expect(listarPedidosSchema.safeParse({ de: "2026-02-30" }).success).toBe(
      false,
    )
    expect(listarPedidosSchema.safeParse({ foo: "x" }).success).toBe(false)
    expect(
      listarPedidosSchema.safeParse({ status: "EMITIDO", limite: "50" })
        .success,
    ).toBe(true)
  })
})
