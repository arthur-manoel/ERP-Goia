import { describe, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import type { Pedido } from "../../../src/modules/pedidos/pedidos.repository"
import {
  canonical,
  hash,
  planoPersistidoSchema,
  snapshotPedido,
  snapshotSchema,
} from "../../../src/modules/pedido-recebiveis/recebiveis.snapshot"

const d = (v: string) => new Prisma.Decimal(v)
function pedido() {
  const item = (id: number) => ({
    id,
    id_produto: 25,
    id_variacao: null,
    id_cor: null,
    id_tamanho: null,
    codigo_produto: null,
    descricao: " Camiseta negociada ",
    unidade: "UN",
    quantidade: d("1"),
    valor_unitario: d("10"),
    valor_desconto: d("0"),
    valor_acrescimo: d("0"),
    valor_total: d("10"),
    observacao: "Observação logística",
  })
  return {
    id: 1,
    id_empresa: 10,
    id_cliente: 12,
    id_condicao_pagamento: null,
    valor_subtotal: d("20"),
    valor_desconto: d("0"),
    valor_frete: d("0"),
    valor_acrescimo: d("0"),
    valor_total: d("20"),
    pedido_cliente_item: [item(20), item(10)],
    status: "ENTREGUE",
    versao: 1,
    data_conclusao: null,
    data_atualizacao: new Date("2026-10-17T12:00:00Z"),
  } as unknown as Pedido
}
const plano = {
  idCategoriaFinanceira: 7,
  vencimentos: ["2027-01-10", "2026-11-10"],
  condicaoPagamento: null,
}
const condicao = {
  id: 3,
  numeroParcelas: 2,
  intervaloDias: 30,
  permiteParcelamento: true,
  descontoPercentual: "0.00",
}

describe("snapshot comercial congelado", () => {
  it("converte apenas conteúdo comercial para valores exatos, em ordem estável de item", () => {
    const p = pedido()
    const snapshot = snapshotPedido(p)
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(snapshot).toEqual({
      idPedido: 1,
      idEmpresa: 10,
      idCliente: 12,
      idCondicaoPagamento: null,
      subtotal: "20.00",
      desconto: "0.00",
      frete: "0.00",
      acrescimo: "0.00",
      total: "20.00",
      itens: [10, 20].map((idItem) => ({
        idItem,
        idProduto: 25,
        idVariacao: null,
        idCor: null,
        idTamanho: null,
        codigo: null,
        descricao: " Camiseta negociada ",
        unidade: "UN",
        quantidade: "1.000",
        precoPraticado: "10.00",
        desconto: "0.00",
        acrescimo: "0.00",
        subtotal: "10.00",
      })),
    })
    expect(p.pedido_cliente_item.map((i) => i.id)).toEqual([20, 10])
  })
  it("não altera o hash por logística, versão, datas ou ordem de leitura dos itens", () => {
    const p = pedido()
    const anterior = hash(snapshotPedido(p))
    p.status = "CONCLUIDO"
    p.versao = 2
    p.data_conclusao = new Date()
    p.data_atualizacao = new Date()
    p.observacao = "Texto posterior de logística"
    p.pedido_cliente_item.reverse()
    p.pedido_cliente_item[0].observacao = "Comprovante atualizado"
    expect(hash(snapshotPedido(p))).toBe(anterior)
  })
  it("faz cópia sem compartilhar o conteúdo mutável da entrada", () => {
    const p = pedido()
    const snapshot = snapshotPedido(p)
    p.pedido_cliente_item[1].descricao = "Nova descrição"
    expect(snapshot.itens[0].descricao).toBe(" Camiseta negociada ")
    expect(hash(snapshotPedido(p))).not.toBe(hash(snapshot))
  })
  it.each([
    "idPedido",
    "idEmpresa",
    "idCliente",
    "idCondicaoPagamento",
    "subtotal",
    "desconto",
    "frete",
    "acrescimo",
    "total",
  ])("hash detecta alteração do campo comercial %s", (campo) => {
    const snapshot = snapshotPedido(pedido())
    expect(hash({ ...snapshot, [campo]: "diferente" })).not.toBe(hash(snapshot))
  })
  it.each([
    "idItem",
    "idProduto",
    "idVariacao",
    "idCor",
    "idTamanho",
    "codigo",
    "descricao",
    "unidade",
    "quantidade",
    "precoPraticado",
    "desconto",
    "acrescimo",
    "subtotal",
  ])("hash detecta alteração do item %s", (campo) => {
    const snapshot = snapshotPedido(pedido())
    expect(
      hash({
        ...snapshot,
        itens: [
          { ...snapshot.itens[0], [campo]: "diferente" },
          snapshot.itens[1],
        ],
      }),
    ).not.toBe(hash(snapshot))
  })
  it("aceita strings legadas sem trim nem nulabilidade inventada", () => {
    const snapshot = snapshotPedido(pedido())
    snapshot.itens[0].descricao = ""
    snapshot.itens[0].unidade = " "
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot)
    expect(
      snapshotSchema.safeParse({
        ...snapshot,
        itens: [{ ...snapshot.itens[0], descricao: null }],
      }).success,
    ).toBe(false)
  })
  it.each(["1", "01.00", "-1.00", "1.001", "10000000000000.00", "NaN", 1])(
    "snapshot rejeita dinheiro não canônico %s",
    (total) => {
      expect(
        snapshotSchema.safeParse({ ...snapshotPedido(pedido()), total })
          .success,
      ).toBe(false)
    },
  )
  it.each([
    "0.000",
    "1",
    "01.000",
    "-1.000",
    "1.0001",
    "1000000000000.000",
    "NaN",
  ])("snapshot rejeita quantidade não canônica %s", (quantidade) => {
    const snapshot = snapshotPedido(pedido())
    expect(
      snapshotSchema.safeParse({
        ...snapshot,
        itens: [{ ...snapshot.itens[0], quantidade }],
      }).success,
    ).toBe(false)
  })
  it("snapshot estrito rejeita campos extras, vazio e IDs não válidos", () => {
    const snapshot = snapshotPedido(pedido())
    for (const input of [
      { ...snapshot, status: "ENTREGUE" },
      { ...snapshot, itens: [] },
      { ...snapshot, idEmpresa: 0 },
      { ...snapshot, itens: [{ ...snapshot.itens[0], status: "ATIVO" }] },
    ])
      expect(snapshotSchema.safeParse(input).success).toBe(false)
  })
})

describe("plano persistido explícito", () => {
  it("valida ausência de condição e cópia exata da condição existente", () => {
    expect(planoPersistidoSchema.parse(plano)).toEqual(plano)
    expect(
      planoPersistidoSchema.parse({ ...plano, condicaoPagamento: condicao }),
    ).toEqual({ ...plano, condicaoPagamento: condicao })
  })
  it("ordem dos vencimentos é parte da identidade do plano", () => {
    expect(hash(plano)).not.toBe(
      hash({ ...plano, vencimentos: [...plano.vencimentos].reverse() }),
    )
    expect(hash(plano)).not.toBe(hash({ ...plano, idCategoriaFinanceira: 8 }))
    expect(hash(plano)).not.toBe(
      hash({ ...plano, condicaoPagamento: condicao }),
    )
  })
  it.each(["-1.00", "100.01", "101.00", "00.00", "1", "0.001", "NaN", 0])(
    "rejeita desconto percentual inválido %s",
    (descontoPercentual) => {
      expect(
        planoPersistidoSchema.safeParse({
          ...plano,
          condicaoPagamento: { ...condicao, descontoPercentual },
        }).success,
      ).toBe(false)
    },
  )
  it("aceita os extremos do percentual sem arredondar", () => {
    for (const descontoPercentual of ["0.00", "100.00"])
      expect(
        planoPersistidoSchema.parse({
          ...plano,
          condicaoPagamento: { ...condicao, descontoPercentual },
        }).condicaoPagamento?.descontoPercentual,
      ).toBe(descontoPercentual)
  })
  it("exige todos os campos e não permite concessões extras no plano", () => {
    for (const input of [
      { ...plano, condicaoPagamento: undefined },
      { ...plano, condicaoPagamento: { ...condicao, permiteCredito: true } },
      { ...plano, condicaoPagamento: { ...condicao, numeroParcelas: 0 } },
      { ...plano, condicaoPagamento: { ...condicao, intervaloDias: -1 } },
      { ...plano, total: "20.00" },
    ])
      expect(planoPersistidoSchema.safeParse(input).success).toBe(false)
  })
})

describe("canonicalização para JSON persistido", () => {
  it("ordena chaves recursivamente e produz SHA-256 independente da ordem JSON", () => {
    const a = { z: [{ b: true, a: null }], a: "ação" }
    const b = { a: "ação", z: [{ a: null, b: true }] }
    expect(canonical(a)).toBe('{"a":"ação","z":[{"a":null,"b":true}]}')
    expect(hash(a)).toBe(hash(b))
    expect(hash(a)).toMatch(/^[a-f0-9]{64}$/)
    expect(hash({})).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    )
  })
  it("preserva ordem de arrays, escapes e tipos JSON", () => {
    expect(hash([1, 2])).not.toBe(hash([2, 1]))
    expect(hash("1")).not.toBe(hash(1))
    expect(hash(null)).not.toBe(hash("null"))
    expect(
      JSON.parse(canonical({ texto: '\n"\\', lista: [false, 0, ""] })),
    ).toEqual({ texto: '\n"\\', lista: [false, 0, ""] })
  })
  it("aceita chaves JSON literais e objetos sem protótipo sem mutação", () => {
    const obj = JSON.parse('{"__proto__":{"a":1},"constructor":2}')
    const anterior = JSON.stringify(obj)
    expect(canonical(obj)).toBe('{"__proto__":{"a":1},"constructor":2}')
    expect(JSON.stringify(obj)).toBe(anterior)
    const semPrototype = Object.create(null)
    semPrototype.valor = 1
    expect(canonical(semPrototype)).toBe('{"valor":1}')
  })
  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    BigInt(1),
    new Date(),
    new Prisma.Decimal("1.00"),
    Symbol("x"),
    () => 1,
  ])(
    "rejeita valor não JSON %s em vez de normalizá-lo silenciosamente",
    (valor) => {
      expect(() => canonical(valor)).toThrow(
        expect.objectContaining({ status: 409 }),
      )
    },
  )
  it("rejeita ciclos e arrays esparsos; referências repetidas não são ciclos", () => {
    const ciclo: Record<string, unknown> = {}
    ciclo.self = ciclo
    expect(() => canonical(ciclo)).toThrow(
      expect.objectContaining({ status: 409 }),
    )
    expect(() => canonical(Array(1))).toThrow(
      expect.objectContaining({ status: 409 }),
    )
    const repetida = { a: 1 }
    expect(canonical([repetida, repetida])).toBe('[{"a":1},{"a":1}]')
  })
})
