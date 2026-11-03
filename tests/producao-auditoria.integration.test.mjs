import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

test("Regressões D1/D2/D3 com HTTP e MariaDB reais", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas } = a
  const empresa = empresas[0]
  const locais = [],
    setores = []
  const produto = a.produtos[1]
  const variacao = a.variacoes[0]
  let pedido, op, tecido
  async function post(url, body, status = 201) {
    const r = await a.chamar(url, "POST", body, { chave: randomUUID() })
    assert.equal(r.status, status, JSON.stringify(r.body))
    return r.body.data ?? r.body
  }
  try {
    for (const nome of ["Tecido local", "Fábrica local", "Loja local"])
      locais.push(
        await prisma.locais_estoque.create({
          data: { id_empresa: empresa, nome },
        }),
      )
    for (const nome of [
      "Tecido",
      "Sublimação",
      "Corte",
      "Costura",
      "Aprontamento",
      "Loja",
    ])
      setores.push(
        await prisma.setores.create({
          data: { id_empresa: empresa, nome, tipo: nome },
        }),
      )
    const tipo = (
      await prisma.produtos.findUniqueOrThrow({ where: { id: produto } })
    ).id_tipo_produto
    tecido = await prisma.produtos.create({
      data: {
        id_tipo_produto: tipo,
        nome: "Tecido de validação local",
        codigo: randomUUID(),
        unidade: "M",
        permite_compra: true,
      },
    })
    a.produtos.push(tecido.id)
    await prisma.produto_empresa.create({
      data: { id_empresa: empresa, id_produto: tecido.id },
    })
    await prisma.produtos.update({
      where: { id: produto },
      data: { permite_producao: true },
    })
    await prisma.ficha_tecnica.create({
      data: {
        id_empresa: empresa,
        id_produto: produto,
        status: "ATIVA",
        data_vigencia: new Date("2026-01-01"),
        ficha_tecnica_item: {
          create: { id_produto_componente: tecido.id, quantidade: "2.000" },
        },
      },
    })
    const fluxo = await prisma.fluxos_producao.create({
      data: {
        id_empresa: empresa,
        nome: "Fluxo local da interface",
        fluxo_producao_setor: {
          create: setores
            .slice(1, 5)
            .map((s, i) => ({ id_setor: s.id, ordem: i + 1 })),
        },
      },
    })
    await prisma.produto_fluxo.create({
      data: { id_empresa: empresa, id_produto: produto, id_fluxo: fluxo.id },
    })
    await post("/api/estoque/entradas", {
      idProduto: tecido.id,
      idLocalEstoque: locais[0].id,
      idSetor: setores[0].id,
      quantidade: "10",
      observacao: "Estoque de teste local",
    })
    await post("/api/estoque/entradas", {
      idProduto: produto,
      idVariacao: variacao.id,
      idLocalEstoque: locais[2].id,
      idSetor: setores[5].id,
      quantidade: "5",
      observacao: "Estoque de teste local",
    })
    pedido = await a.pedido({
      status: null,
      entrega: false,
      itens: [
        {
          idProduto: produto,
          idVariacao: variacao.id,
          quantidade: "2.000",
          precoPraticado: "10.00",
        },
      ],
    })
    await post(`/api/pedidos/${pedido.id}/confirmar`, {
      reservas: [
        {
          origem: "PEDIDO",
          idOrigem: pedido.id,
          idItem: pedido.itens[0].id,
          idProduto: produto,
          idVariacao: variacao.id,
          idLocalEstoque: locais[2].id,
          quantidade: "1",
        },
      ],
    })
    await prisma.contas_bancarias.create({
      data: {
        id_empresa: empresa,
        nome: "Caixa de validação local",
        tipo: "CAIXA",
      },
    })
    op = await post("/api/ordem_producao", {
      numero: `OP-UI-${randomUUID()}`,
      quantidade_planejada: "1",
      id_local_estoque: locais[1].id,
    })
    await post(`/api/ordem_producao/${op.id}/itens`, {
      id_produto: produto,
      id_variacao: variacao.id,
      quantidade: "1",
    })
    await post(`/api/ordem_producao/${op.id}/liberar`, {}, 200)
    await post("/api/estoque/reservas", {
      origem: "PRODUCAO",
      idOrigem: op.id,
      idProduto: tecido.id,
      idLocalEstoque: locais[0].id,
      quantidade: "2",
    })
    await post(`/api/ordem_producao/${op.id}/iniciar`, {}, 200)
    const etapas = await prisma.ordem_producao_fluxo_setor.findMany({
      where: { id_ordem_producao: op.id },
      orderBy: { ordem: "asc" },
    })
    for (let i = 0; i < etapas.length - 1; i++) {
      if (i)
        await post(
          `/api/ordem_producao/${op.id}/etapas/${etapas[i].id}/iniciar`,
          {},
          200,
        )
      await post(
        `/api/ordem_producao/${op.id}/etapas/${etapas[i].id}/concluir`,
        {},
        200,
      )
    }
    await post(
      `/api/ordem_producao/${op.id}/etapas/${etapas.at(-1).id}/iniciar`,
      {},
      200,
    )
    const reserva = await prisma.reserva_estoque.findFirstOrThrow({
      where: { id_ordem_producao: op.id },
    })
    const movimentos = () =>
      prisma.movimentacao_estoque.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      })
    const posicao = () =>
      prisma.estoque.findFirstOrThrow({
        where: { id_empresa: empresa, id_produto: tecido.id },
      })
    const snapshotFisico = async () =>
      JSON.stringify({
        estoque: await posicao(),
        consumos: await prisma.consumo_producao.findMany({
          where: { id_ordem_producao: op.id },
        }),
        movimentos: await movimentos(),
        kardex: await prisma.kardex.findMany({
          where: { id_empresa: empresa },
          orderBy: { id: "asc" },
        }),
      })
    await t.test(
      "D1: encerramento posterior com zero não gera nova baixa",
      async () => {
        await post(`/api/ordem_producao/${op.id}/consumos`, {
          idReserva: reserva.id,
          quantidade: "2",
          concluirConsumo: false,
        })
        assert.equal(
          (
            await prisma.reserva_estoque.findUniqueOrThrow({
              where: { id: reserva.id },
            })
          ).status,
          "ATENDIDA",
        )
        const antes = await snapshotFisico()
        for (const [dados, status] of [
          [{ quantidade: "1" }, 409],
          [{ quantidade: "" }, 400],
          [{ quantidade: "0", concluirConsumo: true }, 400],
          [
            { quantidade: "0", motivoDivergencia: "Motivo sem encerramento" },
            400,
          ],
        ]) {
          const r = await a.chamar(
            `/api/ordem_producao/${op.id}/consumos`,
            "POST",
            { idReserva: reserva.id, ...dados },
            { chave: randomUUID() },
          )
          assert.equal(r.status, status, JSON.stringify(r.body))
          assert.equal(await snapshotFisico(), antes)
        }
        const chave = randomUUID(),
          dados = {
            idReserva: reserva.id,
            quantidade: "0.000",
            concluirConsumo: true,
            motivoDivergencia: "Confirmação posterior de consumo já registrado",
          }
        const confirmado = await a.chamar(
          `/api/ordem_producao/${op.id}/consumos`,
          "POST",
          dados,
          { chave },
        )
        assert.equal(confirmado.status, 201, JSON.stringify(confirmado.body))
        assert.equal(confirmado.body.data.idMovimentacao, null)
        assert.equal(confirmado.body.data.idConsumo, null)
        assert.equal(await snapshotFisico(), antes)
        assert.equal(
          (
            await a.chamar(
              `/api/ordem_producao/${op.id}/consumos`,
              "POST",
              dados,
              { chave },
            )
          ).status,
          200,
        )
        assert.equal(await snapshotFisico(), antes)
        const n = await prisma.necessidade_producao.findFirstOrThrow({
          where: { id_ordem_producao: op.id },
        })
        assert.ok(n.consumo_confirmado_em)
        assert.equal(n.quantidade_consumida.toFixed(3), "2.000")
      },
    )
    const item = await prisma.ordem_producao_item.findFirstOrThrow({
      where: { id_ordem_producao: op.id },
    })
    assert.equal(
      (
        await a.chamar(
          `/api/ordem_producao/${op.id}/itens/${item.id}/producao`,
          "PUT",
          { quantidade_produzida: "1", quantidade_esperada: "0" },
        )
      ).status,
      200,
    )
    await t.test(
      "D3: rollback não deixa auditoria nem entrada de conclusão",
      async () => {
        const antes = await snapshotFisico()
        const auditoria = await prisma.auditoria.count({
          where: { id_empresa: empresa },
        })
        const falha = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresa}`,
          () =>
            a.chamar(
              `/api/ordem_producao/${op.id}/concluir`,
              "POST",
              {},
              { chave: randomUUID() },
            ),
        )
        assert.equal(falha.status, 500)
        assert.equal(await snapshotFisico(), antes)
        assert.equal(
          await prisma.auditoria.count({ where: { id_empresa: empresa } }),
          auditoria,
        )
        assert.equal(
          (
            await prisma.ordem_producao.findUniqueOrThrow({
              where: { id: op.id },
            })
          ).status,
          "EM_PRODUCAO",
        )
      },
    )
    await t.test(
      "D2: duas primeiras conclusões simultâneas em MariaDB retornam 200/409 e uma entrada",
      async () => {
        const respostas = await Promise.all([
          a.chamar(
            `/api/ordem_producao/${op.id}/concluir`,
            "POST",
            {},
            { chave: randomUUID() },
          ),
          a.chamar(
            `/api/ordem_producao/${op.id}/concluir`,
            "POST",
            {},
            { chave: randomUUID() },
          ),
        ])
        assert.deepEqual(
          respostas.map((r) => r.status).sort(),
          [200, 409],
          JSON.stringify(respostas),
        )
        const entradas = await prisma.movimentacao_estoque.findMany({
          where: {
            id_empresa: empresa,
            tipo: "ENTRADA_PRODUCAO",
            origem_id: op.id,
          },
        })
        assert.equal(entradas.length, 1)
        assert.equal(entradas[0].quantidade.toFixed(3), "1.000")
        assert.equal(
          await prisma.consumo_producao.count({
            where: { id_ordem_producao: op.id },
          }),
          1,
        )
        assert.equal(
          (
            await prisma.ordem_producao.findUniqueOrThrow({
              where: { id: op.id },
            })
          ).status,
          "CONCLUIDA",
        )
        assert.equal(
          (await a.chamar(`/api/ordem_producao/${op.id}/concluir`, "POST", {}))
            .status,
          409,
        )
      },
    )
    await t.test(
      "D3: auditoria aponta entrada efetiva e consumo anterior separadamente",
      async () => {
        const eventos = await prisma.auditoria.findMany({
          where: {
            id_empresa: empresa,
            tabela: "ordem_producao",
            id_registro: op.id,
          },
          orderBy: { id: "asc" },
        })
        const dados = eventos.map((e) => JSON.parse(e.dados_novos))
        const conclusoes = dados.filter((e) => e.status === "CONCLUIDA")
        assert.equal(conclusoes.length, 1)
        const evento = conclusoes[0]
        assert.equal(evento.baixaEstoque, undefined)
        assert.equal(evento.estoque.entradaProdutos.situacao, "EFETIVADA")
        assert.equal(evento.estoque.consumoInsumos.situacao, "CONFIRMADO")
        const movimento = await prisma.movimentacao_estoque.findUniqueOrThrow({
          where: { id: evento.estoque.entradaProdutos.movimentos[0].id },
        })
        assert.equal(movimento.origem_tipo, "ORDEM_PRODUCAO")
        assert.equal(movimento.origem_id, op.id)
        assert.equal(
          evento.estoque.entradaProdutos.movimentos[0].quantidade,
          movimento.quantidade.toFixed(3),
        )
        assert.equal(evento.estoque.consumoInsumos.movimentos.length, 1)
        assert.ok(
          dados
            .filter((e) => e.status !== "CONCLUIDA")
            .every((e) => !e.estoque),
        )
      },
    )
  } finally {
    const scope = { in: empresas },
      ordem = { ordem_producao: { id_empresa: scope } }
    for (const [model, where] of [
      ["operacao_erp", { id_empresa: scope }],
      ["transferencia_estoque", { id_empresa: scope }],
      ["consumo_producao", ordem],
      ["reserva_estoque", { id_empresa: scope }],
      ["necessidade_producao", ordem],
      ["ordem_producao_apontamento", { ordem_producao_item: ordem }],
      ["ordem_producao_movimentacao_item", { ordem_producao_item: ordem }],
      ["ordem_producao_movimentacao_setor", ordem],
      ["ordem_producao_consumo_planejado", ordem],
      ["ordem_producao_snapshot", ordem],
      ["ordem_producao_fluxo_setor", ordem],
      ["ordem_producao_item", ordem],
      ["ordem_producao", { id_empresa: scope }],
      ["produto_fluxo", { id_empresa: scope }],
      ["fluxo_producao_setor", { fluxos_producao: { id_empresa: scope } }],
      ["fluxos_producao", { id_empresa: scope }],
      ["estoque_variacao", { id_empresa: scope }],
      ["kardex", { id_empresa: scope }],
      ["movimentacao_estoque", { id_empresa: scope }],
      ["estoque", { id_empresa: scope }],
      ["ficha_tecnica_item", { ficha_tecnica: { id_empresa: scope } }],
      ["ficha_tecnica", { id_empresa: scope }],
      ["setores", { id_empresa: scope }],
    ])
      await prisma[model].deleteMany({ where })
    await a.encerrar()
  }
})
