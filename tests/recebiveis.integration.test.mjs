import { test } from "node:test"
import assert from "node:assert/strict"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

test("Recebíveis: fechamento atômico, parcelas, HTTP real e isolamento", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas, clientes, categorias, produtos, variacoes } = a
  const datas = ["2026-11-10", "2026-12-10", "2027-01-10"]
  const caminho = (p) => `/api/pedidos/${p.id}`
  async function semAlteracao(p, operation, status = 409) {
    const antes = await a.persistido(p)
    const r = await operation()
    assert.equal(r.status, status, JSON.stringify(r.body))
    assert.deepEqual(await a.persistido(p), antes)
    return r
  }
  async function sucesso(p, plano = a.plano(), op = {}) {
    const r = await a.fechar(p, plano, op)
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.equal(r.body.idPedido, p.id)
    assert.equal(r.body.gerado, true)
    assert.ok(r.body.idFechamento > 0)
    assert.ok(r.body.idVenda > 0)
    assert.equal(r.body.versao, p.versao + 1)
    assert.ok(Number.isFinite(Date.parse(r.body.fechadoEm)))
    return r
  }
  try {
    await t.test(
      "01 sem parcelamento gera uma parcela aberta e não recebe",
      async () => {
        const p = await a.pedido()
        const antes = Date.now()
        const r = await sucesso(p)
        const s = await a.persistido(p)
        assert.equal(s.fechamentos.length, 1)
        assert.equal(s.vendas.length, 1)
        assert.equal(s.contas.length, 1)
        assert.equal(s.pedido.status, "ENTREGUE")
        assert.equal(s.pedido.valor_total, "100")
        const conta = s.contas[0]
        assert.equal(conta.numero_parcela, 1)
        assert.equal(conta.total_parcelas, 1)
        assert.equal(conta.valor_original, "100")
        assert.equal(conta.saldo, "100")
        assert.equal(conta.situacao, "ABERTO")
        assert.equal(conta.id_fechamento, r.body.idFechamento)
        assert.ok(Date.parse(r.body.fechadoEm) >= antes - 1000)
        assert.ok(Date.parse(r.body.fechadoEm) <= Date.now() + 1000)
        assert.equal(await prisma.pagamentos_receber.count(), 0)
        assert.equal(await prisma.movimentacoes_financeiras.count(), 0)
      },
    )

    await t.test(
      "02 várias parcelas persistem 1..N, saldos e vínculos",
      async () => {
        const p = await a.pedido({ valor: "90.00" })
        await sucesso(p, a.plano(datas))
        const s = await a.persistido(p)
        assert.deepEqual(
          s.contas.map((c) => c.numero_parcela),
          [1, 2, 3],
        )
        assert.deepEqual(
          s.contas.map((c) => c.total_parcelas),
          [3, 3, 3],
        )
        assert.deepEqual(
          s.contas.map((c) => c.valor_original),
          ["30", "30", "30"],
        )
        assert.ok(s.contas.every((c) => c.saldo === c.valor_original))
        assert.ok(s.contas.every((c) => c.situacao === "ABERTO"))
      },
    )

    await t.test(
      "03 100.00 em três: 33.33 + 33.33 + 33.34 exatos",
      async () => {
        const p = await a.pedido()
        await sucesso(p, a.plano(datas))
        const s = await a.persistido(p)
        assert.deepEqual(
          s.contas.map((c) => c.valor_original),
          ["33.33", "33.33", "33.34"],
        )
        const valores = await prisma.contas_receber.findMany({
          where: { id_fechamento: s.fechamentos[0].id },
        })
        const soma = valores.reduce(
          (v, c) => v.plus(c.valor_original),
          valores[0].valor_original.mul(0),
        )
        assert.equal(soma.toFixed(2), "100.00")
        assert.equal(
          soma.toFixed(2),
          (
            await prisma.pedido_cliente.findUnique({ where: { id: p.id } })
          ).valor_total.toFixed(2),
        )
      },
    )

    await t.test(
      "04 duas variações do mesmo produto preservam ambos os itens vendidos",
      async () => {
        const p = await a.pedido({
          itens: variacoes.map((v, i) => ({
            idProduto: produtos[1],
            idVariacao: v.id,
            quantidade: "1.000",
            precoPraticado: i === 0 ? "30.00" : "70.00",
          })),
        })
        await sucesso(p, a.plano(datas))
        const s = await a.persistido(p)
        assert.equal(s.itensVenda.length, 2)
        assert.deepEqual(
          s.itensVenda
            .map((i) => i.id_pedido_cliente_item)
            .sort((x, y) => x - y),
          p.itens.map((i) => i.id).sort((x, y) => x - y),
        )
        assert.ok(s.itensVenda.every((i) => i.id_produto === produtos[1]))
        assert.deepEqual(
          s.itensVenda.map((i) => i.valor_total),
          ["30", "70"],
        )
      },
    )

    await t.test(
      "05 vencimentos civis conservam dia e ordem, sem usar prazo de entrega",
      async () => {
        const p = await a.pedido()
        const vencimentos = ["2027-01-10", "2026-11-10", "2026-12-10"]
        await sucesso(p, a.plano(vencimentos))
        const s = await a.persistido(p)
        assert.deepEqual(
          s.contas.map((c) => c.data_vencimento.slice(0, 10)),
          vencimentos,
        )
        const r = await a.consultar(p)
        assert.equal(r.status, 200)
        assert.deepEqual(r.body.vencimentos, vencimentos)
        assert.deepEqual(
          r.body.parcelas.map((c) => c.vencimento),
          vencimentos,
        )
        assert.ok(r.body.parcelas.every((c) => c.vencimento !== "2026-11-15"))
      },
    )

    await t.test(
      "06 ausência, plano vazio, datas e limites inválidos não escrevem",
      async () => {
        const p = await a.pedido()
        for (const body of [
          {},
          { idCategoriaFinanceira: categorias[0].id },
          a.plano([]),
          a.plano(["2026-02-29"]),
          a.plano(["2026-11-10T00:00:00Z"]),
          a.plano(["0999-01-01"]),
          a.plano(Array(121).fill("2026-11-10")),
          { ...a.plano(), idCategoriaFinanceira: 0 },
          { ...a.plano(), vencimentos: "2026-11-10" },
        ])
          await semAlteracao(p, () => a.fechar(p, body), 400)
        await semAlteracao(
          p,
          () => a.chamar(`${caminho(p)}/fechar`, "POST", a.plano()),
          400,
        )
        for (const header of ["", "1", 'W/"1"', '"0"', "*"])
          await semAlteracao(
            p,
            () => a.fechar(p, a.plano(), { headers: { "If-Match": header } }),
            400,
          )
      },
    )

    await t.test(
      "07 divisão que produziria parcela zero é rejeitada",
      async () => {
        const p = await a.pedido({ valor: "0.01" })
        await semAlteracao(
          p,
          () => a.fechar(p, a.plano(datas.slice(0, 2))),
          400,
        )
      },
    )

    await t.test(
      "08 campos financeiros do cliente nunca são fonte do total",
      async () => {
        const p = await a.pedido()
        for (const campo of [
          "valorTotal",
          "valor_total",
          "total",
          "subtotal",
          "saldo",
          "parcelas",
          "idEmpresa",
          "idUsuario",
          "fechadoEm",
          "status",
        ])
          await semAlteracao(
            p,
            () => a.fechar(p, { ...a.plano(), [campo]: "1.00" }),
            400,
          )
      },
    )

    await t.test(
      "09 fechamento usa preço persistido e não preço atual do catálogo",
      async () => {
        const p = await a.pedido({ valor: "37.77" })
        await prisma.produto_empresa.updateMany({
          where: { id_empresa: empresas[0], id_produto: produtos[0] },
          data: { preco_venda: "999.99" },
        })
        await sucesso(p)
        const s = await a.persistido(p)
        assert.equal(s.pedido.valor_total, "37.77")
        assert.equal(s.vendas[0].valor_total, "37.77")
        assert.equal(s.itensVenda[0].valor_unitario, "37.77")
        assert.equal(s.contas[0].valor_original, "37.77")
      },
    )

    await t.test(
      "10 pedido sem itens, quantidade inválida ou total zero não fecha",
      async () => {
        const vazio = await a.pedido({ entrega: false })
        await prisma.pedido_cliente_item.deleteMany({
          where: { id_pedido_cliente: vazio.id },
        })
        await semAlteracao(vazio, () => a.fechar(vazio))
        const zerado = await a.pedido({ valor: "0.00" })
        await semAlteracao(zerado, () => a.fechar(zerado))
        const q = await a.pedido()
        await prisma.pedido_cliente_item.update({
          where: { id: q.itens[0].id },
          data: { quantidade: "0.000" },
        })
        await semAlteracao(q, () => a.fechar(q))
      },
    )

    await t.test(
      "11 situação e comprovação física precisam ser elegíveis",
      async () => {
        for (const status of [
          "RASCUNHO",
          "CONFIRMADO",
          "EM_PRODUCAO",
          "PRONTO",
          "EM_ENTREGA",
          "PARCIALMENTE_ENTREGUE",
          "CANCELADO",
        ]) {
          const p = await a.pedido({ status })
          await semAlteracao(p, () => a.fechar(p))
        }
        for (const data of [
          { status: "ENTREGUE" },
          { data_confirmacao_recebimento: null },
          { nome_recebedor: null },
          { nome_recebedor: "   " },
        ]) {
          const p = await a.pedido()
          await prisma.pedido_cliente_entrega.update({
            where: { id: p.entrega.id },
            data,
          })
          await semAlteracao(p, () => a.fechar(p))
        }
        const parcial = await a.pedido()
        await prisma.pedido_cliente_entrega_item.updateMany({
          where: { id_pedido_cliente: parcial.id },
          data: { quantidade: "0.500" },
        })
        await semAlteracao(parcial, () => a.fechar(parcial))
        const excesso = await a.pedido()
        await prisma.pedido_cliente_entrega_item.updateMany({
          where: { id_pedido_cliente: excesso.id },
          data: { quantidade: "1.001" },
        })
        await semAlteracao(excesso, () => a.fechar(excesso))
        const pendente = await a.pedido()
        await prisma.pedido_cliente_entrega.create({
          data: {
            id_pedido_cliente: pendente.id,
            id_usuario: a.usuarios[0],
            numero_entrega: 2,
            status: "PREPARANDO",
          },
        })
        await semAlteracao(pendente, () => a.fechar(pendente))
        const concluido = await a.pedido({ status: "CONCLUIDO" })
        await sucesso(concluido)
        assert.equal((await a.persistido(concluido)).pedido.status, "CONCLUIDO")
      },
    )

    await t.test(
      "12 empresa, cliente, pedido e títulos mantêm vínculos corretos",
      async () => {
        const p = await a.pedido()
        const r = await sucesso(p, a.plano(datas))
        const s = await a.persistido(p)
        assert.equal(s.vendas[0].id_pedido_cliente, p.id)
        assert.equal(s.vendas[0].id_empresa, empresas[0])
        assert.equal(s.vendas[0].id_cliente, clientes[0].id)
        assert.equal(s.fechamentos[0].id_empresa, empresas[0])
        assert.equal(s.fechamentos[0].id_pedido_cliente, p.id)
        assert.equal(s.fechamentos[0].id_venda, r.body.idVenda)
        assert.ok(
          s.contas.every(
            (c) =>
              c.id_empresa === empresas[0] &&
              c.id_venda === r.body.idVenda &&
              c.id_fechamento === r.body.idFechamento &&
              c.id_categoria === categorias[0].id,
          ),
        )
        await assert.rejects(
          prisma.contas_receber.create({
            data: {
              ...s.contas[0],
              id: undefined,
              id_empresa: empresas[1],
              numero_parcela: 99,
              total_parcelas: 99,
              data_lancamento: new Date(),
              data_cadastro: new Date(),
              data_atualizacao: new Date(),
              data_vencimento: new Date("2026-11-10T00:00:00Z"),
            },
          }),
        )
      },
    )

    await t.test(
      "13 replay preserva cobrança, auditoria, fechamento e pagamento posterior",
      async () => {
        const p = await a.pedido()
        const r = await sucesso(p)
        let antes = await a.persistido(p)
        const repetido = await a.fechar(p)
        assert.equal(repetido.status, 200)
        assert.equal(repetido.body.gerado, false)
        assert.equal(repetido.body.idVenda, r.body.idVenda)
        assert.equal(repetido.body.fechadoEm, r.body.fechadoEm)
        assert.deepEqual(await a.persistido(p), antes)
        const conta = antes.contas[0]
        await prisma.pagamentos_receber.create({
          data: {
            id_empresa: empresas[0],
            id_conta_receber: conta.id,
            valor: "20.00",
            forma_pagamento: "PIX",
          },
        })
        await prisma.contas_receber.update({
          where: { id: conta.id },
          data: { saldo: "80.00", situacao: "PARCIAL" },
        })
        antes = await a.persistido(p)
        assert.equal((await a.fechar(p)).status, 200)
        assert.deepEqual(await a.persistido(p), antes)
        const consulta = await a.consultar(p)
        assert.equal(consulta.status, 200)
        assert.equal(consulta.body.parcelas[0].saldo, "80.00")
        assert.equal(consulta.body.parcelas[0].situacao, "PARCIAL")
        assert.equal(
          await prisma.pagamentos_receber.count({
            where: { id_conta_receber: conta.id },
          }),
          1,
        )
      },
    )

    await t.test(
      "14 replay com outro plano, ordem ou categoria retorna conflito",
      async () => {
        const p = await a.pedido()
        await sucesso(p, a.plano(datas))
        for (const plano of [
          a.plano(),
          a.plano([...datas].reverse()),
          a.plano(["2026-11-11", ...datas.slice(1)]),
        ])
          await semAlteracao(p, () => a.fechar(p, plano))
        const categoria = await prisma.categoria_financeira.create({
          data: {
            id_empresa: empresas[0],
            nome: "Outra receita",
            tipo: "AMBOS",
          },
        })
        await semAlteracao(p, () => a.fechar(p, a.plano(datas, categoria.id)))
      },
    )

    await t.test(
      "15 duas chamadas simultâneas produzem um conjunto e replay sem auditoria extra",
      async () => {
        const p = await a.pedido()
        const antes = await prisma.auditoria.count({
          where: { id_empresa: empresas[0] },
        })
        const rs = await Promise.all([
          a.fechar(p, a.plano(datas)),
          a.fechar(p, a.plano(datas)),
        ])
        assert.deepEqual(rs.map((r) => r.status).sort(), [200, 201])
        assert.equal(rs[0].body.idFechamento, rs[1].body.idFechamento)
        const s = await a.persistido(p)
        assert.equal(s.fechamentos.length, 1)
        assert.equal(s.vendas.length, 1)
        assert.equal(s.contas.length, 3)
        assert.equal(s.auditoria.length, antes + 2 + s.contas.length)
        for (const conta of s.contas)
          assert.equal(
            s.auditoria.filter(
              (a) =>
                a.tabela === "contas_receber" &&
                a.id_registro === conta.id &&
                a.acao === "INSERT",
            ).length,
            1,
          )
        assert.equal(
          s.auditoria.filter(
            (a) =>
              a.tabela === "pedido_cliente" &&
              a.id_registro === p.id &&
              a.acao === "UPDATE",
          ).length,
          1,
        )
        assert.equal(
          s.auditoria.filter(
            (a) =>
              a.tabela === "pedido_cliente_fechamento" &&
              a.id_registro === s.fechamentos[0].id &&
              a.acao === "INSERT",
          ).length,
          1,
        )
        const repetido = await a.fechar(p, a.plano(datas))
        assert.equal(repetido.status, 200)
        assert.deepEqual(await a.persistido(p), s)
      },
    )

    await t.test(
      "16 edição concorrente não modifica conteúdo que está fechando",
      async () => {
        const p = await a.pedido()
        const rs = await Promise.all([
          a.fechar(p),
          a.chamar(
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { quantidade: "2.000" },
            { versao: p.versao },
          ),
        ])
        assert.equal(rs[0].status, 201)
        assert.equal(rs[1].status, 409)
        const s = await a.persistido(p)
        assert.equal(s.itens[0].quantidade, "1")
        assert.equal(s.pedido.valor_total, "100")
        assert.equal(s.contas[0].valor_original, "100")
        assert.equal(s.fechamentos.length, 1)
      },
    )
    await t.test(
      "17 falha controlada na segunda parcela reverte toda a operação",
      async () => {
        const p = await a.pedido()
        const antes = await a.persistido(p)
        await a.falhaControlada(
          "contas_receber",
          `NEW.id_empresa = ${empresas[0]} AND NEW.numero_parcela = 2`,
          async () => {
            const r = await a.fechar(p, a.plano(datas))
            assert.equal(r.status, 500)
            assert.deepEqual(r.body, { error: "Erro interno." })
          },
        )
        assert.deepEqual(await a.persistido(p), antes)
        await sucesso(p, a.plano(datas))
      },
    )

    await t.test(
      "18 falha na auditoria reverte fechamento, parcelas, venda e sequência",
      async () => {
        const p = await a.pedido()
        const antes = await a.persistido(p)
        await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresas[0]}`,
          async () => {
            const r = await a.fechar(p)
            assert.equal(r.status, 500)
            assert.deepEqual(r.body, { error: "Erro interno." })
          },
        )
        assert.deepEqual(await a.persistido(p), antes)
        await sucesso(p)
      },
    )

    await t.test(
      "19 fechamento bloqueia cliente, produto, variação, quantidade, preço e plano",
      async () => {
        const p = await a.pedido({
          itens: variacoes.map((v) => ({
            idProduto: produtos[1],
            idVariacao: v.id,
            quantidade: "1.000",
            precoPraticado: "50.00",
          })),
        })
        const r = await sucesso(p)
        const versao = r.body.versao
        const outro = await prisma.clientes.create({
          data: { id_empresa: empresas[0], nome_razao_social: "Outro cliente" },
        })
        for (const [rota, method, body] of [
          [caminho(p), "PATCH", { idCliente: outro.id }],
          [caminho(p), "PATCH", { dataEntregaPrevista: "2027-01-01" }],
          [
            `${caminho(p)}/itens`,
            "POST",
            {
              idProduto: produtos[0],
              quantidade: "1.000",
              precoPraticado: "1.00",
            },
          ],
          [
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { quantidade: "2.000" },
          ],
          [
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { precoPraticado: "1.00" },
          ],
          [
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { idProduto: produtos[0], idVariacao: null },
          ],
          [
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { idVariacao: variacoes[1].id },
          ],
          [`${caminho(p)}/itens/${p.itens[0].id}`, "DELETE", undefined],
        ])
          await semAlteracao(p, () => a.chamar(rota, method, body, { versao }))
        await semAlteracao(p, () => a.fechar(p, a.plano(datas)))
        // O estado comercial é próprio: alteração logística não desfaz o fechamento.
        await prisma.pedido_cliente.update({
          where: { id: p.id },
          data: { status: "RASCUNHO" },
        })
        await semAlteracao(p, () =>
          a.chamar(
            caminho(p),
            "PATCH",
            { observacao: "Não pode editar" },
            { versao },
          ),
        )
        await semAlteracao(p, () =>
          a.chamar(
            `${caminho(p)}/itens/${p.itens[0].id}`,
            "PATCH",
            { quantidade: "2.000" },
            { versao },
          ),
        )
        assert.equal((await a.fechar(p)).status, 200)
        const s = await a.persistido(p)
        assert.equal(s.fechamentos[0].data_fechamento, r.body.fechadoEm)
      },
    )

    await t.test(
      "20 PATCH genérico e itens não permitem fechar ou gerar cobrança",
      async () => {
        const p = await a.pedido({ status: null, entrega: false })
        for (const body of [
          { status: "CONCLUIDO" },
          { fechadoEm: new Date().toISOString() },
          { idFechamento: 1 },
          { vencimentos: datas },
        ])
          await semAlteracao(
            p,
            () => a.chamar(caminho(p), "PATCH", body, { versao: p.versao }),
            400,
          )
        await semAlteracao(
          p,
          () =>
            a.chamar(
              `${caminho(p)}/itens/${p.itens[0].id}`,
              "PATCH",
              { saldo: "0.00" },
              { versao: p.versao },
            ),
          400,
        )
        const s = await a.persistido(p)
        assert.equal(s.fechamentos.length, 0)
        assert.equal(s.vendas.length, 0)
        assert.equal(s.contas.length, 0)
      },
    )

    await t.test(
      "21 legado concluído com venda sem marcador exige regularização explícita",
      async () => {
        const p = await a.pedido({ status: "CONCLUIDO" })
        await prisma.venda.create({
          data: {
            id_pedido_cliente: p.id,
            id_empresa: empresas[0],
            id_cliente: clientes[0].id,
            id_usuario: a.usuarios[0],
            numero: `LEGADO-${p.id}`,
            valor_total: "100.00",
            status: "ENTREGUE",
          },
        })
        const consulta = await semAlteracao(p, () => a.consultar(p))
        assert.match(consulta.body.error, /regulariza|inconsisten|comprov/i)
        const repetido = await semAlteracao(p, () => a.fechar(p))
        assert.match(repetido.body.error, /regulariza|inconsisten|comprov/i)
        const s = await a.persistido(p)
        assert.equal(s.fechamentos.length, 0)
        assert.equal(s.contas.length, 0)
      },
    )

    await t.test(
      "22 conjunto incompleto ou soma divergente não é reparado por GET/retry",
      async () => {
        const parcial = await a.pedido()
        await sucesso(parcial, a.plano(datas))
        const contas = (await a.persistido(parcial)).contas
        await prisma.contas_receber.delete({ where: { id: contas[1].id } })
        await semAlteracao(parcial, () => a.consultar(parcial))
        await semAlteracao(parcial, () => a.fechar(parcial, a.plano(datas)))
        const divergente = await a.pedido()
        await sucesso(divergente)
        const conta = (await a.persistido(divergente)).contas[0]
        await prisma.contas_receber.update({
          where: { id: conta.id },
          data: {
            valor_original: "99.99",
            valor_final: "99.99",
            saldo: "99.99",
          },
        })
        await semAlteracao(divergente, () => a.consultar(divergente))
        await semAlteracao(divergente, () => a.fechar(divergente))
        const semParcelas = await a.pedido()
        await sucesso(semParcelas)
        await prisma.contas_receber.deleteMany({
          where: { id_venda: (await a.persistido(semParcelas)).vendas[0].id },
        })
        await semAlteracao(semParcelas, () => a.consultar(semParcelas))
        await semAlteracao(semParcelas, () => a.fechar(semParcelas))
      },
    )

    await t.test(
      "23 pedidos, categorias e empresas alheios não vazam nem são vinculados",
      async () => {
        const p = await a.pedido()
        const outro = await a.pedido({ empresaIndex: 1 })
        const naoExiste = { ...outro, id: 2147483647 }
        const a1 = await semAlteracao(outro, () => a.fechar(outro), 404)
        const a2 = await a.fechar(naoExiste)
        assert.equal(a2.status, 404)
        assert.deepEqual(a1.body, a2.body)
        const g1 = await semAlteracao(outro, () => a.consultar(outro), 404)
        const g2 = await a.consultar(naoExiste)
        assert.equal(g2.status, 404)
        assert.deepEqual(g1.body, g2.body)
        await semAlteracao(
          p,
          () => a.fechar(p, a.plano(datas, categorias[1].id)),
          404,
        )
        await semAlteracao(
          p,
          () => a.fechar(p, a.plano(), { empresa: empresas[1] }),
          403,
        )
        await sucesso(outro, a.plano(datas, categorias[1].id), {
          empresa: empresas[1],
          usuario: 5,
        })
        const r = await a.consultar(outro, { empresa: empresas[1], usuario: 5 })
        assert.equal(r.status, 200)
        assert.equal(r.body.idCliente, clientes[1].id)
      },
    )

    await t.test(
      "24 autenticação, recursos e vínculos ativos são obrigatórios",
      async () => {
        const p = await a.pedido()
        await semAlteracao(
          p,
          () => a.fechar(p, a.plano(), { usuario: null }),
          401,
        )
        assert.equal((await a.consultar(p, { usuario: null })).status, 401)
        await semAlteracao(
          p,
          () => a.fechar(p, a.plano(), { token: "invalido" }),
          401,
        )
        for (const usuario of [2, 3, 4, 6])
          await semAlteracao(p, () => a.fechar(p, a.plano(), { usuario }), 403)
        for (const [model, where, data, restaurar] of [
          [
            "usuarios",
            { id: a.usuarios[0] },
            { status: "INATIVO" },
            { status: "ATIVO" },
          ],
          [
            "usuario_empresa",
            { id: a.vinculos[0].id },
            { status: "INATIVO" },
            { status: "ATIVO" },
          ],
          [
            "empresas",
            { id: empresas[0] },
            { status: "INATIVA" },
            { status: "ATIVA" },
          ],
        ]) {
          await prisma[model].update({ where, data })
          try {
            await semAlteracao(p, () => a.fechar(p), 403)
            assert.equal((await a.consultar(p, { usuario: 0 })).status, 403)
          } finally {
            await prisma[model].update({ where, data: restaurar })
          }
        }
      },
    )

    await t.test(
      "25 vendedor fecha mas confirmação não expõe financeiro e GET permanece negado",
      async () => {
        const p = await a.pedido()
        const r = await sucesso(p, a.plano(datas), { usuario: 1 })
        assert.deepEqual(
          Object.keys(r.body).sort(),
          [
            "idPedido",
            "idFechamento",
            "idVenda",
            "versao",
            "fechadoEm",
            "gerado",
          ].sort(),
        )
        assert.equal((await a.consultar(p, { usuario: 1 })).status, 403)
        assert.equal(
          (await a.fechar(p, a.plano(datas), { usuario: 1 })).status,
          200,
        )
        assert.equal((await a.consultar(p, { usuario: 1 })).status, 403)
        assert.equal(
          await prisma.permissoes_usuario.count({
            where: {
              id_usuario_empresa: a.vinculos[1].id,
              recurso: "FINANCEIRO",
            },
          }),
          0,
        )
      },
    )

    await t.test(
      "26 consulta exige perfil e permissão financeira, sem conceder edição",
      async () => {
        const p = await a.pedido()
        await sucesso(p, a.plano(datas))
        const r = await a.consultar(p)
        assert.equal(r.status, 200)
        assert.equal(r.body.total, "100.00")
        assert.equal(r.body.totalParcelas, 3)
        assert.equal(r.body.idCliente, clientes[0].id)
        assert.equal(r.body.idCategoriaFinanceira, categorias[0].id)
        assert.deepEqual(
          r.body.parcelas.map((c) => c.valorOriginal),
          ["33.33", "33.33", "33.34"],
        )
        assert.ok(
          r.body.parcelas.every(
            (c) => c.saldo === c.valorOriginal && c.situacao === "ABERTO",
          ),
        )
        for (const usuario of [1, 3, 4, 6])
          assert.equal((await a.consultar(p, { usuario })).status, 403)
        const permissao = await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: a.vinculos[1].id,
            recurso: "FINANCEIRO",
            pode_ler: true,
          },
        })
        try {
          assert.equal(
            (await a.consultar(p, { usuario: 1 })).status,
            403,
            "FINANCEIRO no recurso não transforma perfil VENDAS em financeiro.",
          )
        } finally {
          await prisma.permissoes_usuario.delete({
            where: { id: permissao.id },
          })
        }
        assert.equal(
          (await a.fechar(await a.pedido(), a.plano(), { usuario: 2 })).status,
          403,
        )
        assert.equal((await a.consultar(await a.pedido())).status, 409)
      },
    )

    await t.test(
      "27 fechamento não faz baixa, estoque, pagamento, estorno ou movimentação",
      async () => {
        const antes = {
          pagamentos: await prisma.pagamentos_receber.count(),
          financeiros: await prisma.movimentacoes_financeiras.count(),
          movimentos: await prisma.movimentacao_estoque.count(),
          reservas: await prisma.reserva_estoque.count(),
          kardex: await prisma.kardex.count(),
        }
        const p = await a.pedido()
        await sucesso(p, a.plano(datas))
        await a.consultar(p)
        await a.fechar(p, a.plano(datas))
        assert.deepEqual(
          {
            pagamentos: await prisma.pagamentos_receber.count(),
            financeiros: await prisma.movimentacoes_financeiras.count(),
            movimentos: await prisma.movimentacao_estoque.count(),
            reservas: await prisma.reserva_estoque.count(),
            kardex: await prisma.kardex.count(),
          },
          antes,
        )
        assert.ok(
          (await a.persistido(p)).contas.every(
            (c) => c.situacao === "ABERTO" && c.saldo === c.valor_original,
          ),
        )
      },
    )

    await t.test(
      "28 regressão: rascunho editável e histórico de cliente consulta vendas reais",
      async () => {
        const p = await a.pedido({
          status: null,
          entrega: false,
          valor: "19.90",
        })
        const r = await a.chamar(
          `${caminho(p)}/itens/${p.itens[0].id}`,
          "PATCH",
          { quantidade: "2.000" },
          { versao: p.versao },
        )
        assert.equal(r.status, 200)
        const detalhe = await a.chamar(caminho(p))
        assert.equal(detalhe.status, 200)
        assert.equal(detalhe.body.total, "39.80")
        assert.equal(detalhe.body.versao, 2)
        assert.equal((await a.persistido(p)).contas.length, 0)
        const fechadoAgora = await sucesso(await a.pedido())
        const historico = await a.chamar(
          `/api/clientes/${clientes[0].id}/pedidos`,
        )
        assert.equal(historico.status, 200)
        assert.ok(historico.body.paginacao.total > 0)
        assert.ok(historico.body.pedidos.length > 0)
        assert.ok(
          historico.body.pedidos.some(
            (v) => v.id === fechadoAgora.body.idVenda,
          ),
        )
        const ids = await prisma.venda.findMany({
          where: { id_empresa: empresas[0], id_cliente: clientes[0].id },
          select: { id: true },
        })
        assert.ok(
          historico.body.pedidos.every((v) => ids.some((x) => x.id === v.id)),
        )
        const listado = await a.chamar(
          `/api/pedidos?idCliente=${clientes[0].id}&limite=100`,
        )
        assert.equal(listado.status, 200)
        assert.ok(listado.body.dados.some((x) => x.idPedido === p.id))
      },
    )

    await t.test(
      "29 fechamento recalcula total persistido sem aceitar adulteração do cabeçalho",
      async () => {
        const p = await a.pedido()
        await prisma.pedido_cliente.update({
          where: { id: p.id },
          data: { valor_subtotal: "1.00", valor_total: "1.00" },
        })
        await sucesso(p)
        const s = await a.persistido(p)
        assert.equal(s.pedido.valor_subtotal, "100")
        assert.equal(s.pedido.valor_total, "100")
        assert.equal(s.contas[0].valor_original, "100")
      },
    )

    await t.test(
      "30 conteúdo comercial divergente após fechamento exige regularização",
      async () => {
        const p = await a.pedido()
        await sucesso(p)
        await prisma.pedido_cliente_item.update({
          where: { id: p.itens[0].id },
          data: { valor_unitario: "99.99" },
        })
        await semAlteracao(p, () => a.fechar(p))
        await semAlteracao(p, () => a.consultar(p))
      },
    )

    await t.test(
      "31 replay não depende de catálogo, cliente ou categoria ainda ativos",
      async () => {
        const p = await a.pedido()
        await sucesso(p)
        await prisma.clientes.update({
          where: { id: clientes[0].id },
          data: { status: "INATIVO" },
        })
        await prisma.categoria_financeira.update({
          where: { id: categorias[0].id },
          data: { status: "INATIVA" },
        })
        await prisma.produtos.update({
          where: { id: produtos[0] },
          data: { status: "INATIVO" },
        })
        try {
          const antes = await a.persistido(p)
          assert.equal((await a.fechar(p)).status, 200)
          assert.equal((await a.consultar(p)).status, 200)
          assert.deepEqual(await a.persistido(p), antes)
        } finally {
          await prisma.clientes.update({
            where: { id: clientes[0].id },
            data: { status: "ATIVO" },
          })
          await prisma.categoria_financeira.update({
            where: { id: categorias[0].id },
            data: { status: "ATIVA" },
          })
          await prisma.produtos.update({
            where: { id: produtos[0] },
            data: { status: "ATIVO" },
          })
        }
      },
    )

    await t.test(
      "32 categoria de despesa/inativa e condição incompatível não fecham",
      async () => {
        const p = await a.pedido()
        for (const data of [
          { tipo: "DESPESA", status: "ATIVA" },
          { tipo: "RECEITA", status: "INATIVA" },
        ]) {
          const c = await prisma.categoria_financeira.create({
            data: {
              id_empresa: empresas[0],
              nome: `Inválida ${data.tipo} ${data.status}`,
              ...data,
            },
          })
          await semAlteracao(p, () => a.fechar(p, a.plano(datas, c.id)))
        }
        const condicao = await prisma.condicoes_pagamento.create({
          data: {
            id_empresa: empresas[0],
            nome: "Três parcelas",
            numero_parcelas: 3,
            permite_parcelamento: true,
          },
        })
        await prisma.pedido_cliente.update({
          where: { id: p.id },
          data: { id_condicao_pagamento: condicao.id },
        })
        await semAlteracao(p, () => a.fechar(p), 400)
        await sucesso(p, a.plano(datas))
      },
    )

    await t.test(
      "33 parcela/saldo adulterados e pagamento sem saldo compatível não são normalizados",
      async () => {
        const p = await a.pedido()
        await sucesso(p)
        const conta = (await a.persistido(p)).contas[0]
        await prisma.pagamentos_receber.create({
          data: {
            id_empresa: empresas[0],
            id_conta_receber: conta.id,
            valor: "1.00",
            forma_pagamento: "PIX",
          },
        })
        await semAlteracao(p, () => a.consultar(p))
        await semAlteracao(p, () => a.fechar(p))
      },
    )
    await t.test(
      "34 recebimento integral em remessas fracionadas ignora somente canceladas",
      async () => {
        const p = await a.pedido()
        await prisma.pedido_cliente_entrega_item.updateMany({
          where: { id_pedido_cliente: p.id },
          data: { quantidade: "0.400" },
        })
        for (const [numero, status, quantidade] of [
          [2, "RECEBIMENTO_CONFIRMADO", "0.600"],
          [3, "CANCELADA", "1.000"],
        ]) {
          await prisma.pedido_cliente_entrega.create({
            data: {
              id_pedido_cliente: p.id,
              id_usuario: a.usuarios[0],
              numero_entrega: numero,
              status,
              data_entrega: new Date(Date.now() - 60000),
              data_confirmacao_recebimento:
                status === "CANCELADA" ? null : new Date(Date.now() - 60000),
              nome_recebedor:
                status === "CANCELADA" ? null : "Recebedor da segunda remessa",
              pedido_cliente_entrega_item: {
                create: {
                  id_pedido_cliente_item: p.itens[0].id,
                  quantidade,
                },
              },
            },
          })
        }
        await sucesso(p)
        assert.equal((await a.persistido(p)).contas[0].valor_original, "100")
      },
    )

    await t.test(
      "35 atualizações logísticas posteriores preservam fechamento e títulos",
      async () => {
        const p = await a.pedido()
        const r = await sucesso(p, a.plano(datas))
        const financeiro = await a.persistido(p)
        await prisma.pedido_cliente.update({
          where: { id: p.id },
          data: {
            status: "CONCLUIDO",
            data_conclusao: new Date(),
            versao: { increment: 1 },
          },
        })
        await prisma.pedido_cliente_entrega.update({
          where: { id: p.entrega.id },
          data: { observacao: "Comprovante conferido depois do fechamento" },
        })
        const antes = await a.persistido(p)
        const repetido = await a.fechar(p, a.plano(datas))
        assert.equal(repetido.status, 200)
        assert.equal(repetido.body.fechadoEm, r.body.fechadoEm)
        assert.deepEqual(await a.persistido(p), antes)
        assert.deepEqual(antes.contas, financeiro.contas)
        assert.deepEqual(antes.fechamentos, financeiro.fechamentos)
      },
    )

    await t.test(
      "36 limite de 120 parcelas mantém valores positivos e datas repetidas",
      async () => {
        const p = await a.pedido({ valor: "1.20" })
        const vencimentos = Array(120).fill("2026-11-10")
        await sucesso(p, a.plano(vencimentos))
        const s = await a.persistido(p)
        assert.equal(s.contas.length, 120)
        assert.ok(
          s.contas.every(
            (c) => c.valor_original === "0.01" && c.saldo === "0.01",
          ),
        )
        assert.deepEqual(
          s.contas.map((c) => c.numero_parcela),
          Array.from({ length: 120 }, (_, i) => i + 1),
        )
        const r = await a.consultar(p)
        assert.equal(r.status, 200)
        assert.deepEqual(r.body.vencimentos, vencimentos)
      },
    )
    await t.test(
      "37 título extra sem marcador não fica oculto pelo filtro do fechamento",
      async () => {
        const p = await a.pedido()
        await sucesso(p)
        const s = await a.persistido(p)
        await prisma.contas_receber.create({
          data: {
            id_empresa: empresas[0],
            id_venda: s.vendas[0].id,
            id_categoria: categorias[0].id,
            numero_parcela: 2,
            total_parcelas: 2,
            data_vencimento: new Date("2026-12-10T00:00:00Z"),
            valor_original: "1.00",
            valor_final: "1.00",
          },
        })
        await semAlteracao(p, () => a.consultar(p))
        await semAlteracao(p, () => a.fechar(p))
      },
    )

    await t.test(
      "38 banco impede vincular pagamento a parcela de outra empresa",
      async () => {
        const p = await a.pedido()
        await sucesso(p)
        const conta = (await a.persistido(p)).contas[0]
        const antes = await a.persistido(p)
        await assert.rejects(
          prisma.pagamentos_receber.create({
            data: {
              id_empresa: empresas[1],
              id_conta_receber: conta.id,
              valor: "1.00",
              forma_pagamento: "PIX",
            },
          }),
          (erro) => erro.code === "P2003",
        )
        assert.deepEqual(await a.persistido(p), antes)
        assert.equal((await a.consultar(p)).status, 200)
        assert.equal((await a.fechar(p)).status, 200)
      },
    )
    await t.test(
      "39 data de entrega não é substituída pela confirmação posterior",
      async () => {
        const p = await a.pedido()
        const entrega = new Date("2026-10-10T14:00:00.000Z")
        const confirmacao = new Date("2026-10-17T14:00:00.000Z")
        await prisma.pedido_cliente_entrega.update({
          where: { id: p.entrega.id },
          data: {
            data_entrega: entrega,
            data_confirmacao_recebimento: confirmacao,
          },
        })
        await sucesso(p)
        const s = await a.persistido(p)
        assert.equal(s.vendas[0].data_entrega, entrega.toISOString())
        assert.notEqual(s.vendas[0].data_entrega, confirmacao.toISOString())
      },
    )
    await t.test(
      "40 entrega sem data física conhecida permanece nula na venda",
      async () => {
        const p = await a.pedido()
        await prisma.pedido_cliente_entrega.update({
          where: { id: p.entrega.id },
          data: { data_entrega: null },
        })
        await sucesso(p)
        assert.equal((await a.persistido(p)).vendas[0].data_entrega, null)
      },
    )
  } finally {
    await a.encerrar()
  }
})
