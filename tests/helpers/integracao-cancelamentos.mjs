import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ambienteRecebiveis } from "./integracao-recebiveis.mjs"
export async function ambienteCancelamentos() {
  const a = await ambienteRecebiveis()
  const { prisma, empresas } = a
  const id_empresa = empresas[0]
  const local = await prisma.locais_estoque.create({
    data: { id_empresa, nome: `Retornos ${randomUUID()}` },
  })
  const setor = await prisma.setores.create({
    data: { id_empresa, nome: `Loja ${randomUUID()}`, tipo: "LOJA" },
  })
  const banco = await prisma.contas_bancarias.create({
    data: { id_empresa, nome: `Restituições ${randomUUID()}`, tipo: "CAIXA" },
  })
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const janela = { inicio: Date.now(), usadas: 0 }
  async function post(rota, body = {}, op = {}) {
    if (
      (op.usuario ?? 0) === 0 &&
      (/^\/api\/estoque\/reservas/.test(rota) ||
        /\/(confirmar|entregas)$/.test(rota))
    ) {
      if (janela.usadas >= 24) {
        let espera = janela.inicio + 60100 - Date.now()
        if (espera > 0)
          console.log(
            "Fixture aguardando a janela real de escrita; limite de produção preservado.",
          )
        while (espera > 0) {
          await new Promise((r) => setTimeout(r, Math.min(espera, 30000)))
          espera = janela.inicio + 60100 - Date.now()
        }
      }
      if (Date.now() - janela.inicio >= 60100) {
        janela.inicio = Date.now()
        janela.usadas = 0
      }
      janela.usadas++
    }
    const r = await a.chamar(rota, "POST", body, { chave: randomUUID(), ...op })
    assert.equal(
      r.status,
      op.status ?? 201,
      `${rota}: ${JSON.stringify(r.body)}`,
    )
    return r.body.data ?? r.body
  }
  await post("/api/estoque/entradas", {
    idProduto: a.produtos[1],
    idVariacao: a.variacoes[0].id,
    idLocalEstoque: local.id,
    idSetor: setor.id,
    quantidade: "1000.000",
    observacao: "Saldo inicial exclusivamente da fixture local",
  })
  async function novo({
    quantidade = "3.000",
    valor = "30.00",
    frete = "10.01",
    desconto = "0.00",
    parcelas = 1,
  } = {}) {
    const p = await a.pedido({
      status: null,
      entrega: false,
      itens: [
        {
          idProduto: a.produtos[1],
          idVariacao: a.variacoes[0].id,
          quantidade,
          precoPraticado: valor,
        },
      ],
    })
    // Campos já existentes, fora do card de edição atual, simulam pedido legado íntegro com frete e desconto.
    const sub = p.itens[0].valor_total
    await prisma.pedido_cliente.update({
      where: { id: p.id },
      data: {
        valor_frete: frete,
        valor_desconto: desconto,
        valor_total: sub.plus(frete).minus(desconto),
      },
    })
    if (parcelas > 1) {
      const condicao = await prisma.condicoes_pagamento.create({
        data: {
          id_empresa,
          nome: `Plano ${randomUUID()}`,
          numero_parcelas: parcelas,
          permite_parcelamento: true,
          intervalo_dias: 0,
        },
      })
      await prisma.pedido_cliente.update({
        where: { id: p.id },
        data: { id_condicao_pagamento: condicao.id },
      })
    }
    await post(`/api/pedidos/${p.id}/confirmar`, { reservas: [] })
    return p
  }
  const reservar = async (p, q) =>
    post("/api/estoque/reservas", {
      origem: "PEDIDO",
      idOrigem: p.id,
      idItem: p.itens[0].id,
      idProduto: a.produtos[1],
      idVariacao: a.variacoes[0].id,
      idLocalEstoque: local.id,
      quantidade: q,
    })
  const entregaInput = (p, r, q) => ({
    nomeRecebedor: "Recebedor da fixture",
    itens: [{ idItem: p.itens[0].id, idReserva: r.idReserva, quantidade: q }],
  })
  const entregar = (p, r, q) =>
    post(`/api/pedidos/${p.id}/entregas`, entregaInput(p, r, q))
  async function fechar(p, parcelas = 1) {
    const row = await prisma.pedido_cliente.findUniqueOrThrow({
      where: { id: p.id },
    })
    return post(
      `/api/pedidos/${p.id}/fechar`,
      a.plano(
        Array.from(
          { length: parcelas },
          (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`,
        ),
      ),
      { versao: row.versao },
    )
  }
  async function titulos(p) {
    return prisma.contas_receber.findMany({
      where: { id_empresa, venda: { id_pedido_cliente: p.id } },
      orderBy: { numero_parcela: "asc" },
    })
  }
  const pagamentoInput = (valor) => ({
    valor,
    data: hoje,
    formaPagamento: "PIX",
    idContaBancaria: banco.id,
  })
  const pagar = (titulo, valor) =>
    post(`/api/contas_receber/${titulo.id}/recebimentos`, pagamentoInput(valor))
  async function previa(p, tipo = "PEDIDO", idEntrega) {
    const r = await a.chamar(
      `/api/pedidos/${p.id}/cancelamentos/previa?tipo=${tipo}${idEntrega ? `&idEntrega=${idEntrega}` : ""}`,
    )
    assert.equal(r.status, 200, JSON.stringify(r.body))
    return r.body.data
  }
  async function solicitar(p, tipo = "PEDIDO", idEntrega) {
    const v = await previa(p, tipo, idEntrega)
    return post(`/api/pedidos/${p.id}/cancelamentos`, {
      tipo,
      ...(idEntrega ? { idEntrega } : {}),
      hashEstado: v.hashEstado,
      motivo: "Motivo de cancelamento da fixture",
    })
  }
  async function detalhe(c, op = {}) {
    const r = await a.chamar(`/api/cancelamentos/${c.id}`, "GET", undefined, op)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    return r.body.data
  }
  const executar = (c, op = {}) =>
    post(`/api/cancelamentos/${c.id}/executar`, {}, op)
  const retorno = (c, l, q = "1.000", extra = {}) =>
    post(`/api/cancelamentos/${c.id}/devolucoes`, {
      idLinha: l.id,
      quantidade: q,
      condicao: "APROVEITAVEL",
      observacao: "Recebido e conferido fisicamente",
      idLocalEstoque: local.id,
      idSetor: setor.id,
      ...extra,
    })
  const reembolsoInput = (c, valor) => ({
    idCredito: c.id,
    valor,
    data: hoje,
    idContaBancaria: banco.id,
    observacao: "Restituição efetuada pela fixture",
  })
  const saldo = async () => {
    const row = await prisma.estoque.findFirstOrThrow({
      where: {
        id_empresa,
        id_produto: a.produtos[1],
        id_local_estoque: local.id,
      },
    })
    return {
      fisico: row.quantidade.toFixed(3),
      reservado: row.quantidade_reservada.toFixed(3),
    }
  }
  async function encerrar() {
    const where = { id_empresa: { in: empresas } }
    for (const tabela of [
      "notificacao_interna",
      "notificacao_evento",
      "movimentacoes_financeiras",
      "pedido_reembolso",
      "pedido_credito_receber",
      "pedido_devolucao_destinacao",
      "pedido_devolucao_recebimento",
      "pedido_devolucao_linha",
      "pedido_entrega_estorno",
      "pedido_fechamento_estorno",
      "pedido_cancelamento",
      "operacao_erp",
      "reserva_estoque",
      "kardex",
      "movimentacao_estoque",
      "estoque_variacao",
      "estoque",
    ])
      await prisma[tabela].deleteMany({ where })
    await prisma.setores.deleteMany({ where: { id: setor.id, id_empresa } })
    await prisma.locais_estoque.deleteMany({
      where: { id: local.id, id_empresa },
    })
    await a.encerrar()
  }
  return {
    ...a,
    local,
    setor,
    banco,
    hoje,
    post,
    novo,
    reservar,
    entregaInput,
    entregar,
    fechar,
    titulos,
    pagamentoInput,
    pagar,
    previa,
    solicitar,
    detalhe,
    executar,
    retorno,
    reembolsoInput,
    saldo,
    encerrar,
  }
}
