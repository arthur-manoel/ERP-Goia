import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ambienteCancelamentos } from "./helpers/integracao-cancelamentos.mjs"
test("Cancelamentos HTTP e MariaDB: etapas, efeitos, permissões, concorrência e rollback", async (t) => {
  const a = await ambienteCancelamentos()
  const { prisma } = a
  const empresa = a.empresas[0]
  const op = (c, s) => `/api/cancelamentos/${c.id}/${s}`
  async function completo(extra = {}) {
    const p = await a.novo(extra)
    const r = await a.reservar(p, "3.000")
    const e = await a.entregar(p, r, "3.000")
    await a.fechar(p, extra.parcelas ?? 1)
    return { p, r, e, titulos: await a.titulos(p) }
  }
  async function aprovar(c) {
    return a.post(op(c, "decisao"), {
      decisao: "APROVADA",
      motivo: "Aprovado pelo responsável da fixture",
    })
  }
  async function snapshot() {
    return JSON.stringify({
      saldo: await a.saldo(),
      movimentos: await prisma.movimentacao_estoque.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      kardex: await prisma.kardex.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      pagamentos: await prisma.pagamentos_receber.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      extrato: await prisma.movimentacoes_financeiras.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      creditos: await prisma.pedido_credito_receber.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
    })
  }
  const disputa = (rs) =>
    assert.deepEqual(
      rs.map((r) => r.status).sort(),
      [201, 409],
      JSON.stringify(rs),
    )
  const triggers = new Set()
  async function falha(tabela, operation) {
    const name = `cancel_test_${randomUUID().replaceAll("-", "")}`
    triggers.add(name)
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER \`${name}\` BEFORE INSERT ON \`${tabela}\` FOR EACH ROW BEGIN IF NEW.id_empresa = ${empresa} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha controlada da fixture'; END IF; END`,
    )
    try {
      return await operation()
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER \`${name}\``)
      triggers.delete(name)
    }
  }
  try {
    await t.test(
      "execução inválida mantém aprovação e permite corrigir o envio",
      async () => {
        const p = await a.novo()
        const c = await a.solicitar(p)
        const antes = await prisma.pedido_cancelamento.findUniqueOrThrow({
          where: { id: c.id },
        })
        const efeitosAntes = await snapshot()
        assert.equal(antes.status, "AGUARDANDO_EXECUCAO")
        for (const [body, headers] of [
          [{}, {}],
          [{ invalido: true }, { chave: randomUUID() }],
        ]) {
          const resposta = await a.chamar(
            op(c, "executar"),
            "POST",
            body,
            headers,
          )
          assert.equal(resposta.status, 400, JSON.stringify(resposta.body))
          assert.deepEqual(
            await prisma.pedido_cancelamento.findUniqueOrThrow({
              where: { id: c.id },
            }),
            antes,
          )
          assert.equal(await snapshot(), efeitosAntes)
        }
        await a.executar(c)
        assert.ok((await a.detalhe(c)).executadoEm)
      },
    )
    await t.test(
      "editar descrição de título com crédito preserva saldo e permite receber",
      async () => {
        const p = await a.novo({
          quantidade: "2.000",
          valor: "45.00",
          frete: "10.00",
        })
        const r = await a.reservar(p, "2.000")
        const e = await a.entregar(p, r, "1.000")
        await a.entregar(p, r, "1.000")
        await a.fechar(p)
        const [titulo] = await a.titulos(p)
        assert.equal(titulo.valor_final.toFixed(2), "100.00")
        const c = await a.solicitar(p, "ENTREGA", e.idEntrega)
        await a.executar(c)
        const antes = await prisma.contas_receber.findUniqueOrThrow({
          where: { id: titulo.id },
        })
        assert.equal(antes.saldo.toFixed(2), "50.00")
        const descricao = "Descrição atualizada após cancelamento parcial"
        const resposta = await a.chamar(
          "/api/contas_receber/" + titulo.id,
          "PATCH",
          { descricao },
        )
        assert.equal(resposta.status, 200, JSON.stringify(resposta.body))
        const depois = await prisma.contas_receber.findUniqueOrThrow({
          where: { id: titulo.id },
        })
        assert.equal(depois.descricao, descricao)
        assert.equal(depois.valor_final.toFixed(2), "100.00")
        assert.equal(depois.saldo.toFixed(2), "50.00")
        assert.equal(depois.situacao, antes.situacao)
        await a.pagar(titulo, "50.00")
        const quitado = await prisma.contas_receber.findUniqueOrThrow({
          where: { id: titulo.id },
        })
        assert.equal(quitado.saldo.toFixed(2), "0.00")
        assert.equal(quitado.situacao, "PAGO")
      },
    )
    await t.test(
      "solicitação e rejeição não alteram saldo, títulos ou extrato",
      async () => {
        const { p } = await completo()
        const antes = await snapshot()
        const c = await a.solicitar(p)
        assert.equal(c.status, "AGUARDANDO_EXECUCAO")
        assert.equal(await snapshot(), antes)
        await a.post(op(c, "decisao"), {
          decisao: "REJEITADA",
          motivo: "Não realizar o cancelamento",
        })
        assert.equal(await snapshot(), antes)
        assert.equal(
          (
            await a.chamar(
              op(c, "executar"),
              "POST",
              {},
              { chave: randomUUID() },
            )
          ).status,
          409,
        )
      },
    )
    await t.test(
      "cancela apenas reserva restante, preserva consumo e recebe retorno parcial uma única vez",
      async () => {
        const p = await a.novo()
        const r = await a.reservar(p, "3.000")
        await a.entregar(p, r, "1.000")
        const c = await a.solicitar(p)
        const antes = await a.saldo()
        const chave = randomUUID()
        await a.executar(c, { chave })
        assert.equal((await a.detalhe(c)).status, "EXECUTADA_PENDENCIAS")
        assert.equal((await a.saldo()).fisico, antes.fisico)
        const reserva = await prisma.reserva_estoque.findUniqueOrThrow({
          where: { id: r.idReserva },
        })
        assert.equal(reserva.quantidade_consumida.toFixed(3), "1.000")
        assert.equal(reserva.quantidade_liberada.toFixed(3), "2.000")
        assert.equal(reserva.status, "ATENDIDA")
        assert.equal(
          (
            await prisma.pedido_cliente.findUniqueOrThrow({
              where: { id: p.id },
            })
          ).status,
          "CANCELADO",
        )
        const salvos = await snapshot()
        await a.executar(c, { chave, status: 200 })
        assert.equal(await snapshot(), salvos)
        const l = (await a.detalhe(c)).devolucoes[0]
        await a.retorno(c, l, "0.500")
        const body = {
          idLinha: l.id,
          quantidade: "0.500",
          condicao: "APROVEITAVEL",
          observacao: "Retorno final conferido",
          idLocalEstoque: a.local.id,
          idSetor: a.setor.id,
        }
        disputa(
          await Promise.all([
            a.chamar(op(c, "devolucoes"), "POST", body, {
              chave: randomUUID(),
            }),
            a.chamar(op(c, "devolucoes"), "POST", body, {
              chave: randomUUID(),
            }),
          ]),
        )
        assert.equal((await a.detalhe(c)).status, "CONCLUIDA")
        assert.equal(
          await prisma.pedido_devolucao_destinacao.count({
            where: { pedido_devolucao_recebimento: { id_linha: l.id } },
          }),
          2,
        )
        assert.equal(
          (await a.saldo()).fisico,
          new reserva.quantidade.constructor(antes.fisico).plus(1).toFixed(3),
        )
      },
    )
    await t.test(
      "entrega faturada recebe crédito proporcional completo, com frete, e restituição parcial rastreável",
      async () => {
        const p = await a.novo()
        const r = await a.reservar(p, "3.000")
        const e1 = await a.entregar(p, r, "1.000")
        await a.entregar(p, r, "2.000")
        await a.fechar(p)
        const [titulo] = await a.titulos(p)
        assert.equal(titulo.valor_final.toFixed(2), "100.01")
        await a.pagar(titulo, "80.00")
        const pagamentos = await prisma.pagamentos_receber.findMany({
          where: { id_conta_receber: titulo.id },
        })
        const c = await a.solicitar(p, "ENTREGA", e1.idEntrega)
        assert.equal(
          (await a.previa(p, "ENTREGA", e1.idEntrega)).credito,
          "33.33",
        )
        const antes = await a.saldo()
        await a.executar(c)
        assert.deepEqual(await a.saldo(), antes)
        let d = await a.detalhe(c)
        assert.equal(d.creditos[0].saldoAnulado, "20.01")
        assert.equal(d.creditos[0].restituir, "13.32")
        assert.deepEqual(
          await prisma.pagamentos_receber.findMany({
            where: { id_conta_receber: titulo.id },
          }),
          pagamentos,
        )
        const historico = await a.chamar(
          `/api/contas_receber/${titulo.id}/recebimentos`,
        )
        assert.equal(historico.status, 200, JSON.stringify(historico.body))
        assert.equal(historico.body.data.valorRecebido, "80.00")
        assert.equal(historico.body.data.valorDevido, "66.68")
        assert.equal(historico.body.data.saldo, "0.00")
        const consulta = await a.consultar(p)
        assert.equal(consulta.status, 200, JSON.stringify(consulta.body))
        const l = d.devolucoes[0]
        await a.retorno(c, l, "0.400")
        await a.retorno(c, l, "0.600", {
          condicao: "AVARIADA",
          idLocalEstoque: undefined,
          idSetor: undefined,
        })
        d = await a.detalhe(c)
        const avaria = d.devolucoes[0].recebimentos.find(
          (r) => r.condicao === "AVARIADA",
        )
        const fisico = await a.saldo()
        await a.post(op(c, "destinacoes"), {
          idRecebimento: avaria.id,
          quantidade: "0.600",
          tratamento: "DESCARTE",
          motivo: "Peça danificada sem recuperação",
          idLocalEstoque: a.local.id,
          idSetor: a.setor.id,
        })
        assert.deepEqual(await a.saldo(), fisico)
        const body = a.reembolsoInput(d.creditos[0], "10.00")
        disputa(
          await Promise.all([
            a.chamar(op(c, "reembolsos"), "POST", body, {
              chave: randomUUID(),
            }),
            a.chamar(op(c, "reembolsos"), "POST", body, {
              chave: randomUUID(),
            }),
          ]),
        )
        await a.post(
          op(c, "reembolsos"),
          a.reembolsoInput(d.creditos[0], "3.32"),
        )
        d = await a.detalhe(c)
        assert.equal(d.status, "CONCLUIDA")
        assert.equal(d.creditos[0].reembolsado, "13.32")
        assert.equal(
          await prisma.movimentacoes_financeiras.count({
            where: {
              id_empresa: empresa,
              pedido_reembolso: { id_credito: d.creditos[0].id },
            },
          }),
          2,
        )
        const total = await a.solicitar(p)
        await a.executar(total)
        d = await a.detalhe(total)
        assert.equal(d.creditos[0].restituir, "66.68")
        assert.equal(d.creditos[0].saldoAnulado, "0.00")
        assert.equal(d.devolucoes.length, 1)
        assert.equal(d.devolucoes[0].prevista, "2.000")
        assert.equal(
          (
            await a.chamar(
              `/api/pedidos/${p.id}/fechar`,
              "POST",
              a.plano(["2026-12-01"]),
              { versao: 1 },
            )
          ).status,
          409,
        )
        assert.equal((await a.consultar(p)).status, 200)
        await a.retorno(total, d.devolucoes[0], "2.000")
        await a.post(
          op(total, "reembolsos"),
          a.reembolsoInput(d.creditos[0], "66.68"),
        )
        assert.equal((await a.detalhe(total)).status, "CONCLUIDA")
        assert.equal(
          (
            await prisma.contas_receber.findUniqueOrThrow({
              where: { id: titulo.id },
            })
          ).situacao,
          "CANCELADO",
        )
      },
    )
    await t.test(
      "estorna fechamento sem entrada fictícia ou alteração das entregas e preserva parcelas",
      async () => {
        const { p, e, titulos } = await completo({ parcelas: 2 })
        await a.pagar(titulos[0], titulos[0].valor_final.toFixed(2))
        const antes = await a.saldo()
        const venda = await prisma.venda.findFirstOrThrow({
          where: { id_pedido_cliente: p.id },
        })
        const c = await a.solicitar(p, "FECHAMENTO")
        await a.executar(c)
        const d = await a.detalhe(c)
        assert.deepEqual(await a.saldo(), antes)
        assert.equal(d.devolucoes.length, 0)
        assert.equal(
          (
            await prisma.pedido_cliente_entrega.findUniqueOrThrow({
              where: { id: e.idEntrega },
            })
          ).status,
          "RECEBIMENTO_CONFIRMADO",
        )
        assert.deepEqual(
          await prisma.venda.findUniqueOrThrow({ where: { id: venda.id } }),
          venda,
        )
        assert.equal(
          d.creditos.reduce((s, c) => s + Math.round(Number(c.valor) * 100), 0),
          10001,
        )
        for (const titulo of titulos) {
          const atual = await prisma.contas_receber.findUniqueOrThrow({
            where: { id: titulo.id },
          })
          assert.ok(atual.valor_final.eq(titulo.valor_final))
          assert.equal(atual.saldo.toFixed(2), "0.00")
          assert.equal(atual.situacao, "CANCELADO")
        }
        const credito = d.creditos.find((c) => c.restituir !== "0.00")
        await a.post(
          op(c, "reembolsos"),
          a.reembolsoInput(credito, credito.restituir),
        )
        assert.equal((await a.detalhe(c)).status, "CONCLUIDA")
      },
    )
    await t.test(
      "prazo superior a sete dias exige gerente expresso e impede duas decisões",
      async () => {
        const { p } = await completo()
        await prisma.pedido_cliente_fechamento.updateMany({
          where: { id_pedido_cliente: p.id },
          data: { data_fechamento: new Date(Date.now() - 8 * 86400000) },
        })
        const c = await a.solicitar(p)
        assert.equal(c.status, "AGUARDANDO_APROVACAO")
        assert.equal(
          (
            await a.chamar(
              op(c, "executar"),
              "POST",
              {},
              { chave: randomUUID() },
            )
          ).status,
          409,
        )
        const decisao = {
          decisao: "APROVADA",
          motivo: "Análise gerencial da fixture",
        }
        assert.equal(
          (
            await a.chamar(op(c, "decisao"), "POST", decisao, {
              chave: randomUUID(),
              usuario: 1,
            })
          ).status,
          403,
        )
        assert.equal(
          (
            await a.chamar(op(c, "decisao"), "POST", decisao, {
              chave: randomUUID(),
              usuario: 5,
              empresa: a.empresas[1],
            })
          ).status,
          404,
        )
        const cargo = a.vinculos[1].id_cargo
        await a.post(`/api/cancelamentos/cargos/${cargo}`, {
          aprovaCancelamento: true,
        })
        disputa(
          await Promise.all([
            a.chamar(op(c, "decisao"), "POST", decisao, {
              chave: randomUUID(),
              usuario: 1,
            }),
            a.chamar(op(c, "decisao"), "POST", decisao, {
              chave: randomUUID(),
              usuario: 1,
            }),
          ]),
        )
        assert.equal((await a.detalhe(c)).decisao, "APROVADA")
        await a.executar(c)
      },
    )
    await t.test(
      "dados legados sem fechamento confiável são persistidos para análise e não geram compensação",
      async () => {
        const p = await a.novo()
        await prisma.pedido_cliente.update({
          where: { id: p.id },
          data: { status: "CONCLUIDO" },
        })
        const c = await a.solicitar(p)
        const d = await a.detalhe(c)
        assert.equal(d.referenciaInconsistente, true)
        assert.equal(d.exigeAprovacao, true)
        await aprovar(c)
        const antes = await snapshot()
        assert.equal(
          (
            await a.chamar(
              op(c, "executar"),
              "POST",
              {},
              { chave: randomUUID() },
            )
          ).status,
          409,
        )
        assert.equal(await snapshot(), antes)
        assert.equal((await a.detalhe(c)).status, "INTERVENCAO")
      },
    )
    await t.test(
      "falha de crédito desfaz liberação, entrega, título e extrato; permite reavaliação",
      async () => {
        const { p } = await completo()
        const c = await a.solicitar(p)
        const antes = await snapshot()
        await falha("pedido_credito_receber", async () => {
          const r = await a.chamar(
            op(c, "executar"),
            "POST",
            {},
            { chave: randomUUID() },
          )
          assert.equal(r.status, 500, JSON.stringify(r.body))
        })
        assert.equal(await snapshot(), antes)
        assert.equal(
          await prisma.pedido_entrega_estorno.count({
            where: { id_cancelamento: c.id },
          }),
          0,
        )
        assert.equal((await a.detalhe(c)).status, "INTERVENCAO")
        const v = await a.previa(p)
        await a.post(op(c, "reavaliar"), {
          hashEstado: v.hashEstado,
          motivo: "Falha corrigida e origem conferida",
        })
        await a.executar(c)
      },
    )
    await t.test(
      "falha posterior nas notificações não desfaz solicitação e a entrega é deduplicada",
      async () => {
        const p = await a.novo()
        let c
        await falha("notificacao_interna", async () => {
          c = await a.solicitar(p)
          assert.ok(c.id)
        })
        assert.equal((await a.detalhe(c)).status, "AGUARDANDO_EXECUCAO")
        assert.equal(
          await prisma.notificacao_evento.count({
            where: { id_cancelamento: c.id, processado_em: null },
          }),
          1,
        )
        await a.post("/api/notificacoes/processar")
        const qtd = await prisma.notificacao_interna.count({
          where: { notificacao_evento: { id_cancelamento: c.id } },
        })
        assert.ok(qtd > 0)
        await a.post("/api/notificacoes/processar")
        assert.equal(
          await prisma.notificacao_interna.count({
            where: { notificacao_evento: { id_cancelamento: c.id } },
          }),
          qtd,
        )
        const feed = await a.chamar("/api/notificacoes")
        assert.equal(feed.status, 200)
        assert.ok(feed.body.data.itens.length > 0)
        await a.post(`/api/notificacoes/${feed.body.data.itens[0].id}/ler`)
      },
    )
    await t.test(
      "cancelamento concorrente com entrega confirma somente uma primeira operação",
      async () => {
        const p = await a.novo()
        const r = await a.reservar(p, "3.000")
        const c = await a.solicitar(p)
        disputa(
          await Promise.all([
            a.chamar(op(c, "executar"), "POST", {}, { chave: randomUUID() }),
            a.chamar(
              `/api/pedidos/${p.id}/entregas`,
              "POST",
              a.entregaInput(p, r, "3.000"),
              { chave: randomUUID() },
            ),
          ]),
        )
        const pedido = await prisma.pedido_cliente.findUniqueOrThrow({
          where: { id: p.id },
        })
        const entregas = await prisma.pedido_cliente_entrega.count({
          where: { id_pedido_cliente: p.id },
        })
        assert.equal(
          pedido.status === "CANCELADO" ? entregas === 0 : entregas === 1,
          true,
        )
        assert.ok(
          (await prisma.pedido_entrega_estorno.count({
            where: { id_cancelamento: c.id },
          })) === 0,
        )
      },
    )
    await t.test(
      "cancelamento concorrente com fechamento impede venda e cobrança duplicadas",
      async () => {
        const p = await a.novo()
        const r = await a.reservar(p, "3.000")
        await a.entregar(p, r, "3.000")
        const c = await a.solicitar(p)
        const pedido = await prisma.pedido_cliente.findUniqueOrThrow({
          where: { id: p.id },
        })
        disputa(
          await Promise.all([
            a.chamar(op(c, "executar"), "POST", {}, { chave: randomUUID() }),
            a.chamar(
              `/api/pedidos/${p.id}/fechar`,
              "POST",
              a.plano(["2026-12-01"]),
              { versao: pedido.versao },
            ),
          ]),
        )
        assert.ok(
          (await prisma.venda.count({ where: { id_pedido_cliente: p.id } })) <=
            1,
        )
        assert.ok(
          (await prisma.pedido_cliente_fechamento.count({
            where: { id_pedido_cliente: p.id },
          })) <= 1,
        )
      },
    )
    await t.test(
      "cancelamento concorrente com pagamento revalida crédito e conserva somente efeitos confirmados",
      async () => {
        const { p, titulos } = await completo()
        const c = await a.solicitar(p)
        disputa(
          await Promise.all([
            a.chamar(op(c, "executar"), "POST", {}, { chave: randomUUID() }),
            a.chamar(
              `/api/contas_receber/${titulos[0].id}/recebimentos`,
              "POST",
              a.pagamentoInput("50.00"),
              { chave: randomUUID() },
            ),
          ]),
        )
        const creditos = await prisma.pedido_credito_receber.count({
          where: { id_cancelamento: c.id },
        })
        const pagamentos = await prisma.pagamentos_receber.count({
          where: { id_conta_receber: titulos[0].id },
        })
        assert.ok(
          (creditos === 1 && pagamentos === 0) ||
            (creditos === 0 && pagamentos === 1),
        )
      },
    )
    await t.test(
      "duas execuções e repetição não duplicam estorno ou compensação",
      async () => {
        const { p } = await completo()
        const c = await a.solicitar(p)
        disputa(
          await Promise.all([
            a.chamar(op(c, "executar"), "POST", {}, { chave: randomUUID() }),
            a.chamar(op(c, "executar"), "POST", {}, { chave: randomUUID() }),
          ]),
        )
        assert.equal(
          await prisma.pedido_entrega_estorno.count({
            where: { id_cancelamento: c.id },
          }),
          1,
        )
        assert.equal(
          await prisma.pedido_credito_receber.count({
            where: { id_cancelamento: c.id },
          }),
          1,
        )
      },
    )
    await t.test(
      "financeiro restrito, empresa ativa e revogação de permissão inclusive na repetição",
      async () => {
        const { p } = await completo()
        const c = await a.solicitar(p)
        await a.executar(c)
        const vendas = await a.detalhe(c, { usuario: 3 })
        assert.deepEqual(vendas.creditos, [])
        assert.equal(vendas.plano.credito, undefined)
        const estoque = await a.detalhe(c, { usuario: 4 })
        assert.deepEqual(estoque.creditos, [])
        assert.ok(estoque.devolucoes.length > 0)
        const financeiro = await a.detalhe(c, { usuario: 2 })
        assert.ok(financeiro.creditos.length > 0)
        assert.equal(
          (
            await a.chamar(`/api/cancelamentos/${c.id}`, "GET", undefined, {
              usuario: 5,
              empresa: a.empresas[1],
            })
          ).status,
          404,
        )
        assert.equal(
          (
            await a.chamar(
              op(c, "reembolsos"),
              "POST",
              a.reembolsoInput(financeiro.creditos[0], "1.00"),
              { usuario: 1, chave: randomUUID() },
            )
          ).status,
          403,
        )
        const novo = await a.novo()
        const v = await a.previa(novo)
        const body = {
          tipo: "PEDIDO",
          motivo: "Pedido duplicado confirmado",
          hashEstado: v.hashEstado,
        }
        const chave = randomUUID()
        await prisma.permissoes_usuario.updateMany({
          where: { id_usuario_empresa: a.vinculos[1].id, recurso: "PEDIDOS" },
          data: { pode_excluir: true },
        })
        await a.post(`/api/pedidos/${novo.id}/cancelamentos`, body, {
          usuario: 1,
          chave,
        })
        await prisma.permissoes_usuario.updateMany({
          where: { id_usuario_empresa: a.vinculos[1].id, recurso: "PEDIDOS" },
          data: { pode_excluir: false },
        })
        assert.equal(
          (
            await a.chamar(
              `/api/pedidos/${novo.id}/cancelamentos`,
              "POST",
              body,
              { usuario: 1, chave },
            )
          ).status,
          403,
        )
        assert.equal(
          (
            await a.chamar(`/api/cancelamentos/${c.id}`, "GET", undefined, {
              usuario: null,
            })
          ).status,
          401,
        )
      },
    )

    await t.test(
      "alteração após aprovação exige reavaliação e nova decisão vinculada",
      async () => {
        const { p, titulos } = await completo()
        await prisma.pedido_cliente_fechamento.updateMany({
          where: { id_pedido_cliente: p.id },
          data: { data_fechamento: new Date(Date.now() - 9 * 86400000) },
        })
        const c = await a.solicitar(p)
        await aprovar(c)
        await a.pagar(titulos[0], "1.00")
        const antes = await snapshot()
        assert.equal(
          (
            await a.chamar(
              op(c, "executar"),
              "POST",
              {},
              { chave: randomUUID() },
            )
          ).status,
          409,
        )
        assert.equal(await snapshot(), antes)
        const v = await a.previa(p)
        await a.post(op(c, "reavaliar"), {
          hashEstado: v.hashEstado,
          motivo: "Pagamento novo conferido antes da execução",
        })
        let d = await a.detalhe(c)
        assert.equal(d.status, "AGUARDANDO_APROVACAO")
        assert.equal(d.decisao, null)
        assert.equal(
          (
            await a.chamar(
              op(c, "executar"),
              "POST",
              {},
              { chave: randomUUID() },
            )
          ).status,
          409,
        )
        await aprovar(c)
        await a.executar(c)
        d = await a.detalhe(c)
        assert.equal(d.creditos[0].restituir, "1.00")
      },
    )
    await t.test(
      "IDs de outra solicitação e conta de outra empresa não autorizam efeitos; financeiro executa sua etapa",
      async () => {
        const um = await completo(),
          dois = await completo()
        await a.pagar(um.titulos[0], "100.01")
        await a.pagar(dois.titulos[0], "100.01")
        const c1 = await a.solicitar(um.p),
          c2 = await a.solicitar(dois.p)
        await a.executar(c1)
        await a.executar(c2)
        const d1 = await a.detalhe(c1),
          d2 = await a.detalhe(c2)
        const antes = await snapshot()
        assert.equal(
          (
            await a.chamar(
              op(c1, "devolucoes"),
              "POST",
              {
                idLinha: d2.devolucoes[0].id,
                quantidade: "1.000",
                condicao: "AVARIADA",
                observacao: "Retorno de outra solicitação",
              },
              { chave: randomUUID() },
            )
          ).status,
          404,
        )
        assert.equal(
          (
            await a.chamar(
              op(c1, "reembolsos"),
              "POST",
              a.reembolsoInput(d2.creditos[0], "1.00"),
              { chave: randomUUID() },
            )
          ).status,
          404,
        )
        const banco = await prisma.contas_bancarias.create({
          data: {
            id_empresa: a.empresas[1],
            nome: "Conta da outra empresa da fixture",
            tipo: "CAIXA",
          },
        })
        assert.equal(
          (
            await a.chamar(
              op(c1, "reembolsos"),
              "POST",
              {
                ...a.reembolsoInput(d1.creditos[0], "1.00"),
                idContaBancaria: banco.id,
              },
              { chave: randomUUID() },
            )
          ).status,
          404,
        )
        assert.equal(await snapshot(), antes)
        await prisma.permissoes_usuario.updateMany({
          where: {
            id_usuario_empresa: a.vinculos[2].id,
            recurso: "FINANCEIRO",
          },
          data: { pode_editar: true },
        })
        const resultado = await a.post(
          op(c1, "reembolsos"),
          a.reembolsoInput(d1.creditos[0], "3.00"),
          { usuario: 2 },
        )
        const registrado = await prisma.pedido_reembolso.findUniqueOrThrow({
          where: { id: resultado.idReembolso },
        })
        assert.equal(registrado.id_usuario, a.usuarios[2])
        assert.equal(registrado.valor.toFixed(2), "3.00")
        const credito = await prisma.pedido_credito_receber.findUniqueOrThrow({
          where: { id: d1.creditos[0].id },
        })
        try {
          await prisma.pedido_credito_receber.update({
            where: { id: credito.id },
            data: { id_cancelamento: c2.id },
          })
          assert.equal(
            (
              await a.chamar(
                `/api/contas_receber/${um.titulos[0].id}/recebimentos`,
              )
            ).status,
            409,
          )
          assert.equal((await a.consultar(um.p)).status, 409)
        } finally {
          await prisma.pedido_credito_receber.update({
            where: { id: credito.id },
            data: { id_cancelamento: c1.id },
          })
        }
      },
    )
    await t.test(
      "falhas no retorno e extrato deixam pendência visível sem efeito parcial",
      async () => {
        const { p, titulos } = await completo()
        await a.pagar(titulos[0], "10.00")
        const c = await a.solicitar(p)
        await a.executar(c)
        let d = await a.detalhe(c)
        let antes = await snapshot()
        await falha("movimentacao_estoque", async () => {
          const r = await a.chamar(
            op(c, "devolucoes"),
            "POST",
            {
              idLinha: d.devolucoes[0].id,
              quantidade: "3.000",
              condicao: "APROVEITAVEL",
              observacao: "Retorno físico da fixture",
              idLocalEstoque: a.local.id,
              idSetor: a.setor.id,
            },
            { chave: randomUUID() },
          )
          assert.equal(r.status, 500)
        })
        assert.equal(await snapshot(), antes)
        assert.equal(
          await prisma.pedido_devolucao_recebimento.count({
            where: { id_linha: d.devolucoes[0].id },
          }),
          0,
        )
        assert.ok((await a.detalhe(c)).ultimaFalha)
        await a.retorno(c, d.devolucoes[0], "3.000")
        assert.equal((await a.detalhe(c)).ultimaFalha, null)
        antes = await snapshot()
        const chave = randomUUID()
        await falha("movimentacoes_financeiras", async () => {
          const r = await a.chamar(
            op(c, "reembolsos"),
            "POST",
            a.reembolsoInput(d.creditos[0], "10.00"),
            { chave },
          )
          assert.equal(r.status, 500)
        })
        assert.equal(await snapshot(), antes)
        assert.equal(
          await prisma.pedido_reembolso.count({
            where: { id_credito: d.creditos[0].id },
          }),
          0,
        )
        assert.ok((await a.detalhe(c)).ultimaFalha)
        await a.post(
          op(c, "reembolsos"),
          a.reembolsoInput(d.creditos[0], "10.00"),
          { chave },
        )
        d = await a.detalhe(c)
        assert.equal(d.status, "CONCLUIDA")
        assert.equal(d.ultimaFalha, null)
        assert.equal(
          await prisma.notificacao_evento.count({
            where: { id_cancelamento: c.id, tipo: "FALHA_ETAPA" },
          }),
          2,
        )
      },
    )
    await t.test(
      "notificação sem destinatário autorizado permanece pendente até existir acesso ativo",
      async () => {
        const { p } = await completo()
        await prisma.pedido_cliente_fechamento.updateMany({
          where: { id_pedido_cliente: p.id },
          data: { data_fechamento: new Date(Date.now() - 8 * 86400000) },
        })
        const v = await a.previa(p)
        const cargo = a.vinculos[1].id_cargo
        await prisma.permissoes_usuario.updateMany({
          where: { id_usuario_empresa: a.vinculos[1].id, recurso: "PEDIDOS" },
          data: { pode_excluir: true },
        })
        await prisma.cargos.update({
          where: { id: cargo },
          data: { aprova_cancelamento: false },
        })
        await prisma.usuario_empresa.update({
          where: { id: a.vinculos[0].id },
          data: { status: "INATIVO" },
        })
        let c
        try {
          c = await a.post(
            `/api/pedidos/${p.id}/cancelamentos`,
            {
              tipo: "PEDIDO",
              motivo: "Aguardar gerente da empresa",
              hashEstado: v.hashEstado,
            },
            { usuario: 1 },
          )
          assert.equal(
            await prisma.notificacao_evento.count({
              where: { id_cancelamento: c.id, processado_em: null },
            }),
            1,
          )
          assert.equal(
            await prisma.notificacao_interna.count({
              where: { notificacao_evento: { id_cancelamento: c.id } },
            }),
            0,
          )
        } finally {
          await prisma.usuario_empresa.update({
            where: { id: a.vinculos[0].id },
            data: { status: "ATIVO" },
          })
          await prisma.cargos.update({
            where: { id: cargo },
            data: { aprova_cancelamento: true },
          })
        }
        await a.post("/api/notificacoes/processar")
        assert.equal(
          await prisma.notificacao_evento.count({
            where: { id_cancelamento: c.id, processado_em: null },
          }),
          0,
        )
        assert.ok(
          (await prisma.notificacao_interna.count({
            where: { notificacao_evento: { id_cancelamento: c.id } },
          })) > 0,
        )
      },
    )
  } finally {
    for (const name of triggers)
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS \`${name}\``)
    await a.encerrar()
  }
})
