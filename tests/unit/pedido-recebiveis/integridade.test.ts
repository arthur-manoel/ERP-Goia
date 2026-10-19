import { describe, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import type { Pedido } from "../../../src/modules/pedidos/pedidos.repository"
import type { Fechamento } from "../../../src/modules/pedido-recebiveis/recebiveis.repository"
import {
  calcularPedido,
  regularizacao,
  validarIntegridade,
} from "../../../src/modules/pedido-recebiveis/recebiveis.integridade"
import {
  hash,
  snapshotPedido,
} from "../../../src/modules/pedido-recebiveis/recebiveis.snapshot"

const decimal = (value: string) => new Prisma.Decimal(value)
const data = new Date("2026-10-17T12:00:00.000Z")
type Estado = { pedido: Pedido; fechamento: Fechamento }

function fixture(): Estado {
  const pedido: Pedido = {
    id: 10,
    id_empresa: 20,
    id_cliente: 30,
    id_usuario: 40,
    id_condicao_pagamento: null,
    id_endereco_entrega: null,
    numero: "1001",
    referencia_cliente: null,
    status: "ENTREGUE",
    canal_venda: "BALCAO",
    data_pedido: data,
    data_confirmacao: data,
    data_previsao_entrega: data,
    data_conclusao: null,
    data_cancelamento: null,
    motivo_cancelamento: null,
    valor_subtotal: decimal("100.00"),
    valor_desconto: decimal("0.00"),
    valor_frete: decimal("0.00"),
    valor_acrescimo: decimal("0.00"),
    valor_total: decimal("100.00"),
    destinatario: null,
    telefone_entrega: null,
    endereco_entrega: null,
    numero_entrega: null,
    complemento_entrega: null,
    bairro_entrega: null,
    cidade_entrega: null,
    estado_entrega: null,
    cep_entrega: null,
    referencia_entrega: null,
    observacao: null,
    observacao_interna: null,
    data_cadastro: data,
    data_atualizacao: data,
    versao: 2,
    chave_idempotencia: "teste-pedido-1001",
    hash_requisicao: "0".repeat(64),
    pedido_cliente_item: [
      {
        id: 50,
        id_pedido_cliente: 10,
        numero_item: 1,
        id_produto: 60,
        id_variacao: null,
        id_cor: null,
        id_tamanho: null,
        codigo_produto: "P-60",
        descricao: "Produto histórico",
        unidade: "UN",
        quantidade: decimal("1.000"),
        valor_unitario: decimal("100.00"),
        valor_desconto: decimal("0.00"),
        valor_acrescimo: decimal("0.00"),
        valor_total: decimal("100.00"),
        data_previsao_entrega: null,
        observacao: null,
        data_cadastro: data,
        data_atualizacao: data,
        produto_variacoes: null,
        _count: {
          item_venda: 1,
          ordem_producao_item: 0,
          pedido_cliente_entrega_item: 1,
        },
      },
    ],
    _count: {
      venda: 1,
      ordem_producao: 0,
      pedido_cliente_entrega: 1,
      pedido_cliente_fechamento: 1,
    },
  }
  const plano = {
    idCategoriaFinanceira: 70,
    vencimentos: ["2026-11-10", "2026-12-10", "2027-01-10"],
    condicaoPagamento: null,
  }
  const snapshot = snapshotPedido(pedido)
  const fechamento: Fechamento = {
    id: 80,
    id_empresa: 20,
    id_pedido_cliente: 10,
    id_cliente: 30,
    id_venda: 90,
    id_categoria: 70,
    id_usuario: 40,
    data_fechamento: data,
    valor_total: decimal("100.00"),
    total_parcelas: 3,
    plano_pagamento: plano,
    hash_plano: hash(plano),
    hash_pedido: hash(snapshot),
    snapshot_pedido: snapshot,
    venda: {
      id: 90,
      id_pedido_cliente: 10,
      id_empresa: 20,
      id_cliente: 30,
      id_usuario: 40,
      numero: "1001",
      status: "ENTREGUE",
      data_venda: data,
      data_entrega: data,
      valor_total: decimal("100.00"),
      entrega_nome_destinatario: null,
      entrega_telefone: null,
      entrega_endereco: null,
      entrega_numero: null,
      entrega_complemento: null,
      entrega_bairro: null,
      entrega_cidade: null,
      entrega_estado: null,
      entrega_cep: null,
      observacao_interna: null,
      id_condicao_pagamento: null,
      id_endereco_entrega: null,
      canal_venda: "BALCAO",
      status_financeiro: "FATURADA",
      valor_subtotal: decimal("100.00"),
      valor_desconto: decimal("0.00"),
      valor_frete: decimal("0.00"),
      valor_acrescimo: decimal("0.00"),
      observacao: null,
      data_atualizacao: data,
      item_venda: [
        {
          id: 100,
          id_pedido_cliente_item: 50,
          id_venda: 90,
          id_empresa: 20,
          id_produto: 60,
          descricao: null,
          id_cor: null,
          id_tamanho: null,
          quantidade: decimal("1.000"),
          valor_unitario: decimal("100.00"),
          valor_total: decimal("100.00"),
        },
      ],
      contas_receber: ["33.33", "33.33", "33.34"].map((valor, index) => ({
        id: 110 + index,
        id_empresa: 20,
        id_venda: 90,
        id_categoria: 70,
        id_fechamento: 80,
        numero_parcela: index + 1,
        total_parcelas: 3,
        descricao: null,
        data_lancamento: data,
        data_vencimento: new Date(plano.vencimentos[index] + "T00:00:00Z"),
        valor_original: decimal(valor),
        valor_desconto: decimal("0.00"),
        valor_acrescimo: decimal("0.00"),
        valor_final: decimal(valor),
        saldo: decimal(valor),
        situacao: "ABERTO",
        observacao: null,
        data_cadastro: data,
        data_atualizacao: data,
        pagamentos_receber: [],
      })),
    },
  }
  return { pedido, fechamento }
}

function pagamento(
  estado: Estado,
  valor: string,
  status: "CONFIRMADO" | "CANCELADO" = "CONFIRMADO",
) {
  const conta = estado.fechamento.venda.contas_receber[0]
  conta.pagamentos_receber.push({
    id: 120 + conta.pagamentos_receber.length,
    id_empresa: 20,
    id_conta_receber: conta.id,
    data_pagamento: data,
    valor: decimal(valor),
    forma_pagamento: "PIX",
    observacao: null,
    status,
    data_cadastro: data,
  })
  return conta
}

function conflito(estado: Estado) {
  expect(() => validarIntegridade(estado.pedido, estado.fechamento)).toThrow(
    expect.objectContaining({ status: 409 }),
  )
}

describe("integridade do conjunto financeiro já gerado", () => {
  it("valida obrigação, venda e três parcelas sem alterar os dados", () => {
    const e = fixture()
    const antes = JSON.stringify(e)
    const r = validarIntegridade(e.pedido, e.fechamento)
    expect(r.plano.vencimentos).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ])
    expect(r.parcelas.map((p) => p.valor.toFixed(2))).toEqual([
      "33.33",
      "33.33",
      "33.34",
    ])
    expect(JSON.stringify(e)).toBe(antes)
  })

  const vinculos: Array<[string, (e: Estado) => void]> = [
    [
      "empresa",
      (e) => {
        e.fechamento.id_empresa++
      },
    ],
    [
      "pedido",
      (e) => {
        e.fechamento.id_pedido_cliente++
      },
    ],
    [
      "cliente",
      (e) => {
        e.fechamento.id_cliente++
      },
    ],
    [
      "categoria",
      (e) => {
        e.fechamento.id_categoria++
      },
    ],
    [
      "quantidade de parcelas",
      (e) => {
        e.fechamento.total_parcelas++
      },
    ],
    [
      "total do fechamento",
      (e) => {
        e.fechamento.valor_total = decimal("99.99")
      },
    ],
    [
      "mais de uma venda",
      (e) => {
        e.pedido._count.venda = 2
      },
    ],
    [
      "marcador ausente",
      (e) => {
        e.pedido._count.pedido_cliente_fechamento = 0
      },
    ],
    [
      "outra venda",
      (e) => {
        e.fechamento.id_venda++
      },
    ],
    [
      "empresa da venda",
      (e) => {
        e.fechamento.venda.id_empresa++
      },
    ],
    [
      "cliente da venda",
      (e) => {
        e.fechamento.venda.id_cliente++
      },
    ],
    [
      "pedido da venda",
      (e) => {
        e.fechamento.venda.id_pedido_cliente = 11
      },
    ],
    [
      "condição da venda",
      (e) => {
        e.fechamento.venda.id_condicao_pagamento = 1
      },
    ],
    [
      "venda cancelada",
      (e) => {
        e.fechamento.venda.status = "CANCELADA"
      },
    ],
    [
      "financeiro cancelado",
      (e) => {
        e.fechamento.venda.status_financeiro = "CANCELADA"
      },
    ],
    [
      "subtotal da venda",
      (e) => {
        e.fechamento.venda.valor_subtotal = decimal("99.99")
      },
    ],
    [
      "total da venda",
      (e) => {
        e.fechamento.venda.valor_total = decimal("99.99")
      },
    ],
    [
      "desconto da venda",
      (e) => {
        e.fechamento.venda.valor_desconto = decimal("0.01")
      },
    ],
    [
      "frete da venda",
      (e) => {
        e.fechamento.venda.valor_frete = decimal("0.01")
      },
    ],
    [
      "acréscimo da venda",
      (e) => {
        e.fechamento.venda.valor_acrescimo = decimal("0.01")
      },
    ],
    [
      "item vendido ausente",
      (e) => {
        e.fechamento.venda.item_venda = []
      },
    ],
    [
      "origem do item vendido",
      (e) => {
        e.fechamento.venda.item_venda[0].id_pedido_cliente_item = 51
      },
    ],
    [
      "produto vendido",
      (e) => {
        e.fechamento.venda.item_venda[0].id_produto++
      },
    ],
    [
      "venda do item",
      (e) => {
        e.fechamento.venda.item_venda[0].id_venda++
      },
    ],
    [
      "quantidade vendida",
      (e) => {
        e.fechamento.venda.item_venda[0].quantidade = decimal("2.000")
      },
    ],
    [
      "preço vendido",
      (e) => {
        e.fechamento.venda.item_venda[0].valor_unitario = decimal("99.99")
      },
    ],
    [
      "total vendido",
      (e) => {
        e.fechamento.venda.item_venda[0].valor_total = decimal("99.99")
      },
    ],
    [
      "mesmo item em outra venda",
      (e) => {
        e.pedido.pedido_cliente_item[0]._count.item_venda = 2
      },
    ],
    [
      "parcela ausente",
      (e) => {
        e.fechamento.venda.contas_receber.splice(1, 1)
      },
    ],
    [
      "parcela extra",
      (e) => {
        e.fechamento.venda.contas_receber.push({
          ...e.fechamento.venda.contas_receber[0],
          id: 999,
        })
      },
    ],
  ]
  it.each(vinculos)("rejeita vínculo inconsistente: %s", (_nome, alterar) => {
    const e = fixture()
    alterar(e)
    conflito(e)
  })

  const parcelas: Array<
    [string, (c: Fechamento["venda"]["contas_receber"][number]) => void]
  > = [
    [
      "empresa",
      (c) => {
        c.id_empresa++
      },
    ],
    [
      "venda",
      (c) => {
        c.id_venda++
      },
    ],
    [
      "marcador ausente",
      (c) => {
        c.id_fechamento = null
      },
    ],
    [
      "outro marcador",
      (c) => {
        c.id_fechamento = 81
      },
    ],
    [
      "categoria",
      (c) => {
        c.id_categoria++
      },
    ],
    [
      "numeração",
      (c) => {
        c.numero_parcela = 3
      },
    ],
    [
      "total de parcelas",
      (c) => {
        c.total_parcelas = 2
      },
    ],
    [
      "vencimento",
      (c) => {
        c.data_vencimento = new Date("2026-11-11T00:00:00Z")
      },
    ],
    [
      "valor original",
      (c) => {
        c.valor_original = decimal("33.32")
      },
    ],
    [
      "valor final",
      (c) => {
        c.valor_final = decimal("33.32")
      },
    ],
    [
      "desconto",
      (c) => {
        c.valor_desconto = decimal("0.01")
      },
    ],
    [
      "acréscimo",
      (c) => {
        c.valor_acrescimo = decimal("0.01")
      },
    ],
    [
      "saldo nulo",
      (c) => {
        c.saldo = null
      },
    ],
    [
      "saldo negativo",
      (c) => {
        c.saldo = decimal("-0.01")
      },
    ],
    [
      "saldo excedente",
      (c) => {
        c.saldo = decimal("33.34")
      },
    ],
    [
      "cancelada",
      (c) => {
        c.situacao = "CANCELADO"
      },
    ],
    [
      "paga com saldo",
      (c) => {
        c.situacao = "PAGO"
      },
    ],
    [
      "parcial sem pagamento",
      (c) => {
        c.situacao = "PARCIAL"
      },
    ],
  ]
  it.each(parcelas)("não repara parcela divergente: %s", (_nome, alterar) => {
    const e = fixture()
    alterar(e.fechamento.venda.contas_receber[0])
    const antes = JSON.stringify(e)
    conflito(e)
    expect(JSON.stringify(e)).toBe(antes)
  })

  it.each(["plano_pagamento", "snapshot_pedido"] as const)(
    "rejeita JSON inválido em %s",
    (campo) => {
      for (const valor of [null, "{json inválido", [], { inesperado: true }]) {
        const e = fixture()
        e.fechamento[campo] = valor
        conflito(e)
      }
    },
  )
  it.each(["hash_plano", "hash_pedido"] as const)(
    "rejeita hash adulterado em %s",
    (campo) => {
      const e = fixture()
      e.fechamento[campo] = "f".repeat(64)
      conflito(e)
    },
  )
  it("rejeita alteração comercial posterior mesmo quando a parcela antiga está completa", () => {
    const e = fixture()
    e.pedido.pedido_cliente_item[0].descricao = "Produto alterado"
    conflito(e)
  })
  it("não confunde progresso logístico com alteração financeira", () => {
    const e = fixture()
    e.pedido.status = "CONCLUIDO"
    e.pedido.data_conclusao = new Date()
    e.pedido.data_atualizacao = new Date()
    e.pedido.versao++
    expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
  })
  it("regularização usa conflito explícito, nunca sucesso falso", () => {
    expect(regularizacao).toThrow(
      expect.objectContaining({
        status: 409,
        message: expect.stringMatching(/regulariza/i),
      }),
    )
  })
})

describe("saldo e recebimentos posteriores não são reinicializados", () => {
  it("aceita pagamento parcial confirmado com saldo exato", () => {
    const e = fixture()
    const c = pagamento(e, "20.00")
    c.saldo = decimal("13.33")
    c.situacao = "PARCIAL"
    const antes = JSON.stringify(e)
    expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
    expect(JSON.stringify(e)).toBe(antes)
  })
  it("aceita quitação posterior sem recriar cobrança nem restaurar saldo", () => {
    const e = fixture()
    const c = pagamento(e, "33.33")
    c.saldo = decimal("0.00")
    c.situacao = "PAGO"
    expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
    expect(c.saldo.toFixed(2)).toBe("0.00")
  })
  it("não abate pagamento cancelado e preserva saldo inicial", () => {
    const e = fixture()
    pagamento(e, "20.00", "CANCELADO")
    expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
  })
  it.each([false, true])(
    "aceita ATRASADO com saldo positivo e pagamento parcial=%s",
    (parcial) => {
      const e = fixture()
      const c = e.fechamento.venda.contas_receber[0]
      if (parcial) {
        pagamento(e, "20.00")
        c.saldo = decimal("13.33")
      }
      c.situacao = "ATRASADO"
      expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
    },
  )
  it.each(["0.00", "-1.00", "33.34", "NaN"])(
    "rejeita recebimento inválido ou excessivo %s",
    (valor) => {
      const e = fixture()
      pagamento(e, valor)
      conflito(e)
    },
  )
  it("rejeita soma excessiva de pagamentos mesmo individualmente válidos", () => {
    const e = fixture()
    pagamento(e, "20.00")
    pagamento(e, "20.00")
    conflito(e)
  })
  it.each(["id_empresa", "id_conta_receber"] as const)(
    "não mascara pagamento ligado a outro %s",
    (campo) => {
      const e = fixture()
      const c = pagamento(e, "20.00")
      c.saldo = decimal("13.33")
      c.situacao = "PARCIAL"
      c.pagamentos_receber[0][campo]++
      conflito(e)
    },
  )
  it.each(["ABERTO", "PAGO"] as const)(
    "rejeita pagamento parcial com situação %s",
    (situacao) => {
      const e = fixture()
      const c = pagamento(e, "20.00")
      c.saldo = decimal("13.33")
      c.situacao = situacao
      conflito(e)
    },
  )
  it("rejeita saldo não abatido apesar de pagamento confirmado", () => {
    const e = fixture()
    pagamento(e, "20.00")
    conflito(e)
  })
  it("rejeita saldo zero sem quitação e saldo abatido por pagamento cancelado", () => {
    const e = fixture()
    const c = pagamento(e, "20.00", "CANCELADO")
    c.saldo = decimal("13.33")
    c.situacao = "PARCIAL"
    conflito(e)
    c.saldo = decimal("0.00")
    c.situacao = "PAGO"
    conflito(e)
  })
})

describe("coerência da condição congelada sem depender do catálogo atual", () => {
  it("plano persistido com centavos insuficientes exige regularização 409", () => {
    const e = fixture()
    const item = e.pedido.pedido_cliente_item[0]
    item.valor_unitario = decimal("0.01")
    item.valor_total = decimal("0.01")
    e.pedido.valor_subtotal = decimal("0.01")
    e.pedido.valor_total = decimal("0.01")
    e.fechamento.valor_total = decimal("0.01")
    e.fechamento.venda.valor_subtotal = decimal("0.01")
    e.fechamento.venda.valor_total = decimal("0.01")
    e.fechamento.venda.item_venda[0].valor_unitario = decimal("0.01")
    e.fechamento.venda.item_venda[0].valor_total = decimal("0.01")
    e.fechamento.snapshot_pedido = snapshotPedido(e.pedido)
    e.fechamento.hash_pedido = hash(e.fechamento.snapshot_pedido)
    conflito(e)
  })
  function comCondicao() {
    const e = fixture()
    e.pedido.id_condicao_pagamento = 200
    e.fechamento.venda.id_condicao_pagamento = 200
    const plano = {
      idCategoriaFinanceira: 70,
      vencimentos: ["2026-11-10", "2026-12-10", "2027-01-10"],
      condicaoPagamento: {
        id: 200,
        numeroParcelas: 3,
        intervaloDias: 0,
        permiteParcelamento: true,
        descontoPercentual: "0.00",
      },
    }
    e.fechamento.snapshot_pedido = snapshotPedido(e.pedido)
    e.fechamento.hash_pedido = hash(e.fechamento.snapshot_pedido)
    e.fechamento.plano_pagamento = plano
    e.fechamento.hash_plano = hash(plano)
    return { ...e, plano }
  }
  it("aceita a condição preservada e compatível com o plano", () => {
    const e = comCondicao()
    expect(() => validarIntegridade(e.pedido, e.fechamento)).not.toThrow()
  })
  it.each([
    ["outra condição", { id: 201 }],
    ["número diferente", { numeroParcelas: 2 }],
    ["parcelamento proibido", { permiteParcelamento: false }],
    ["intervalo incompatível", { intervaloDias: 30 }],
  ])("rejeita %s mesmo com hash do plano recalculado", (_nome, alteracao) => {
    const e = comCondicao()
    Object.assign(e.plano.condicaoPagamento, alteracao)
    e.fechamento.hash_plano = hash(e.plano)
    conflito(e)
  })
  it("condição nula não pode ocultar condição vinculada ao pedido", () => {
    const e = comCondicao()
    e.fechamento.plano_pagamento = { ...e.plano, condicaoPagamento: null }
    e.fechamento.hash_plano = hash(e.fechamento.plano_pagamento)
    conflito(e)
  })
})

describe("recálculo do pedido usa fórmula única e ajustes históricos", () => {
  it("calcula HALF_UP por item antes de somar", () => {
    const { pedido } = fixture()
    pedido.pedido_cliente_item = [1, 2].map((id) => ({
      ...pedido.pedido_cliente_item[0],
      id,
      quantidade: decimal("0.125"),
      valor_unitario: decimal("0.12"),
    }))
    const r = calcularPedido(pedido)
    expect(r.itens.map((i) => i.valor.toFixed(2))).toEqual(["0.02", "0.02"])
    expect(r.total.toFixed(2)).toBe("0.04")
  })
  it("reaplica descontos, frete e acréscimos sem buscar catálogo", () => {
    const { pedido } = fixture()
    pedido.pedido_cliente_item[0].valor_desconto = decimal("5.00")
    pedido.pedido_cliente_item[0].valor_acrescimo = decimal("2.00")
    pedido.valor_desconto = decimal("3.00")
    pedido.valor_frete = decimal("4.00")
    pedido.valor_acrescimo = decimal("1.00")
    const r = calcularPedido(pedido)
    expect(r.subtotal.toFixed(2)).toBe("97.00")
    expect(r.total.toFixed(2)).toBe("99.00")
  })
  it("aceita bruto acima do limite quando o líquido após desconto cabe", () => {
    const { pedido } = fixture()
    const item = pedido.pedido_cliente_item[0]
    item.quantidade = decimal("2.000")
    item.valor_unitario = decimal("5000000000000.00")
    item.valor_desconto = decimal("0.01")
    expect(calcularPedido(pedido).total.toFixed(2)).toBe("9999999999999.99")
  })
  it.each(["0.000", "-1.000", "NaN", "Infinity"])(
    "rejeita quantidade persistida inválida %s",
    (quantidade) => {
      const { pedido } = fixture()
      pedido.pedido_cliente_item[0].quantidade = decimal(quantidade)
      expect(() => calcularPedido(pedido)).toThrow(
        expect.objectContaining({ status: 409 }),
      )
    },
  )
  it.each(["valor_unitario", "valor_desconto", "valor_acrescimo"] as const)(
    "rejeita dinheiro negativo em item.%s",
    (campo) => {
      const { pedido } = fixture()
      pedido.pedido_cliente_item[0][campo] = decimal("-0.01")
      expect(() => calcularPedido(pedido)).toThrow(
        expect.objectContaining({ status: 409 }),
      )
    },
  )
  it.each(["valor_desconto", "valor_frete", "valor_acrescimo"] as const)(
    "rejeita dinheiro negativo no cabeçalho.%s",
    (campo) => {
      const { pedido } = fixture()
      pedido[campo] = decimal("-0.01")
      expect(() => calcularPedido(pedido)).toThrow(
        expect.objectContaining({ status: 409 }),
      )
    },
  )
  it("não fecha pedido sem itens ou total final positivo", () => {
    const { pedido } = fixture()
    pedido.pedido_cliente_item = []
    expect(() => calcularPedido(pedido)).toThrow(
      expect.objectContaining({ status: 409 }),
    )
    const e = fixture()
    e.pedido.valor_desconto = decimal("100.00")
    expect(() => calcularPedido(e.pedido)).toThrow(
      expect.objectContaining({ status: 409 }),
    )
  })
})
