import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

test("Recebimentos HTTP: fechamento real, persistência, concorrência e rollback local", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas } = a
  const contas = []
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  for (const id_empresa of empresas)
    contas.push(
      await prisma.contas_bancarias.create({
        data: {
          id_empresa,
          nome: `Conta ${randomUUID()}`,
          tipo: "CONTA_CORRENTE",
        },
      }),
    )
  const rota = (id) => `/api/contas_receber/${id}/recebimentos`
  const input = (valor = "40.00", extra = {}) => ({
    valor,
    data: hoje,
    formaPagamento: "PIX",
    idContaBancaria: contas[0].id,
    ...extra,
  })
  const receber = (titulo, dados = input(), chave = randomUUID(), op = {}) =>
    a.chamar(rota(titulo.id), "POST", dados, { chave, ...op })
  async function novo(valor = "100.00") {
    const pedido = await a.pedido({ valor })
    assert.equal((await a.fechar(pedido)).status, 201)
    const titulo = await prisma.contas_receber.findFirstOrThrow({
      where: { venda: { id_pedido_cliente: pedido.id } },
    })
    return { pedido, titulo }
  }
  const estado = async (id) =>
    JSON.stringify({
      titulo: await prisma.contas_receber.findUnique({ where: { id } }),
      pagamentos: await prisma.pagamentos_receber.findMany({
        where: { id_conta_receber: id },
        orderBy: { id: "asc" },
      }),
      movimentos: await prisma.movimentacoes_financeiras.findMany({
        where: { pagamentos_receber: { id_conta_receber: id } },
        orderBy: { id: "asc" },
      }),
      auditoria: await prisma.auditoria.findMany({
        where: { id_empresa: empresas[0] },
        orderBy: { id: "asc" },
      }),
    })
  try {
    await t.test(
      "parcial, restante e repetição não duplicam; fechamento continua íntegro",
      async () => {
        const { pedido, titulo } = await novo()
        const chave = randomUUID()
        let resposta = await receber(titulo, input(), chave)
        assert.equal(resposta.status, 201, JSON.stringify(resposta.body))
        assert.equal(resposta.body.data.saldo, "60.00")
        assert.equal(resposta.body.data.situacao, "PARCIAL")
        const antes = await estado(titulo.id)
        resposta = await receber(titulo, input("40.0"), chave)
        assert.equal(resposta.status, 200)
        assert.equal(resposta.body.data.criado, false)
        assert.equal(await estado(titulo.id), antes)
        assert.equal((await receber(titulo, input("41.00"), chave)).status, 409)
        resposta = await receber(titulo, input("60.00"))
        assert.equal(resposta.status, 201)
        assert.equal(resposta.body.data.saldo, "0.00")
        assert.equal(resposta.body.data.situacao, "PAGO")
        assert.equal((await receber(titulo, input("0.01"))).status, 409)
        assert.equal((await a.fechar(pedido)).status, 200)
        const historico = await a.chamar(rota(titulo.id))
        assert.equal(historico.status, 200)
        assert.equal(historico.body.data.valorRecebido, "100.00")
        assert.equal(historico.body.data.pagamentos.length, 2)
        assert.ok(
          historico.body.data.pagamentos.every((p) => p.responsavel && p.conta),
        )
        assert.equal(
          await prisma.movimentacoes_financeiras.count({
            where: { pagamentos_receber: { id_conta_receber: titulo.id } },
          }),
          2,
        )
        const vendas = await prisma.venda.findMany({
          where: { id_pedido_cliente: pedido.id },
        })
        assert.equal(vendas.length, 1)
      },
    )
    await t.test(
      "valor inválido, precisão, datas, conta e forma não escrevem",
      async () => {
        const { titulo } = await novo()
        const inativa = await prisma.contas_bancarias.create({
          data: {
            id_empresa: empresas[0],
            nome: `Inativa ${randomUUID()}`,
            tipo: "CAIXA",
            status: "INATIVA",
          },
        })
        for (const [dados, status] of [
          [input("0"), 400],
          [input("-1"), 400],
          [input("1.001"), 400],
          [input("1e2"), 400],
          [input("100.01"), 409],
          [input("10", { formaPagamento: "INVALIDO" }), 400],
          [input("10", { data: "2026-02-30" }), 400],
          [input("10", { data: "9999-12-31" }), 400],
          [input("10", { data: "1000-01-01" }), 400],
          [input("10", { idContaBancaria: contas[1].id }), 404],
          [input("10", { idContaBancaria: inativa.id }), 404],
          [input("10", { id_empresa: empresas[1] }), 400],
        ]) {
          const antes = await estado(titulo.id)
          const r = await receber(titulo, dados)
          assert.equal(r.status, status, JSON.stringify(r.body))
          assert.equal(await estado(titulo.id), antes)
        }
      },
    )
    await t.test(
      "duas baixas disputam saldo e mesma chave disputa um único pagamento",
      async () => {
        const { titulo } = await novo()
        const respostas = await Promise.all([
          receber(titulo, input("60")),
          receber(titulo, input("60")),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409])
        assert.equal(
          (
            await prisma.contas_receber.findUnique({ where: { id: titulo.id } })
          ).saldo.toFixed(2),
          "40.00",
        )
        const segundo = (await novo()).titulo
        const chave = randomUUID()
        const repeticoes = await Promise.all([
          receber(segundo, input("33.33"), chave),
          receber(segundo, input("33.33"), chave),
        ])
        assert.deepEqual(repeticoes.map((r) => r.status).sort(), [200, 201])
        assert.equal(
          await prisma.pagamentos_receber.count({
            where: { id_conta_receber: segundo.id },
          }),
          1,
        )
      },
    )
    await t.test(
      "falha intermediária na auditoria reverte pagamento, extrato e título",
      async () => {
        const { titulo } = await novo()
        const antes = await estado(titulo.id)
        const chave = randomUUID()
        const r = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresas[0]}`,
          () => receber(titulo, input("50"), chave),
        )
        assert.equal(r.status, 500)
        assert.equal(await estado(titulo.id), antes)
        assert.equal((await receber(titulo, input("50"), chave)).status, 201)
      },
    )
    await t.test(
      "permissões de leitura e edição e isolamento são independentes",
      async () => {
        const { titulo } = await novo()
        assert.equal(
          (await receber(titulo, input(), randomUUID(), { usuario: 2 })).status,
          403,
        )
        assert.equal(
          (await a.chamar(rota(titulo.id), "GET", undefined, { usuario: 2 }))
            .status,
          200,
        )
        assert.equal(
          (await receber(titulo, input(), randomUUID(), { usuario: 1 })).status,
          403,
        )
        assert.equal(
          (await receber(titulo, input(), randomUUID(), { usuario: null }))
            .status,
          401,
        )
        assert.equal(
          (
            await a.chamar(rota(titulo.id), "GET", undefined, {
              usuario: 5,
              empresa: empresas[1],
            })
          ).status,
          404,
        )
        await prisma.permissoes_usuario.updateMany({
          where: {
            id_usuario_empresa: a.vinculos[2].id,
            recurso: "FINANCEIRO",
          },
          data: { pode_editar: true },
        })
        assert.equal(
          (await receber(titulo, input(), randomUUID(), { usuario: 2 })).status,
          201,
        )
        await prisma.permissoes_usuario.updateMany({
          where: {
            id_usuario_empresa: a.vinculos[2].id,
            recurso: "FINANCEIRO",
          },
          data: { pode_editar: false },
        })
      },
    )
    await t.test(
      "cancelamento e saldo histórico incoerente bloqueiam sem reparo implícito",
      async () => {
        const { titulo } = await novo()
        await prisma.contas_receber.update({
          where: { id: titulo.id },
          data: { situacao: "CANCELADO" },
        })
        const antes = await estado(titulo.id)
        assert.equal((await receber(titulo)).status, 409)
        assert.equal(await estado(titulo.id), antes)
        const outro = (await novo()).titulo
        await prisma.contas_receber.update({
          where: { id: outro.id },
          data: { saldo: "99.99" },
        })
        assert.equal((await receber(outro)).status, 409)
        assert.equal((await a.chamar(rota(outro.id))).status, 409)
      },
    )
    await t.test(
      "chaves são sensíveis a maiúsculas e recibo repetido não depende de conta ainda ativa",
      async () => {
        const { titulo } = await novo()
        const chave = `Teste-${randomUUID()}`
        assert.equal((await receber(titulo, input("1"), chave)).status, 201)
        assert.equal(
          (await receber(titulo, input("1"), chave.toLowerCase())).status,
          201,
        )
        await prisma.contas_bancarias.update({
          where: { id: contas[0].id },
          data: { status: "INATIVA" },
        })
        assert.equal((await receber(titulo, input("1"), chave)).status, 200)
        assert.equal((await receber(titulo, input("1"))).status, 404)
        await prisma.contas_bancarias.update({
          where: { id: contas[0].id },
          data: { status: "ATIVA" },
        })
      },
    )
  } finally {
    await a.encerrar()
  }
})
