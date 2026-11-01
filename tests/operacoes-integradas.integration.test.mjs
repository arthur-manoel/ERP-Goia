import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

test("Três cards HTTP reais: reserva, produção, transferência, entrega, fechamento e recebimento", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas } = a
  const empresa = empresas[0]
  const locais = [],
    setores = []
  let op
  async function post(rota, body = {}, chave = randomUUID(), status = 201) {
    const r = await a.chamar(rota, "POST", body, { chave })
    assert.equal(r.status, status, `${rota}: ${JSON.stringify(r.body)}`)
    return r.body.data ?? r.body
  }
  const produto = a.produtos[1]
  const [m, g] = a.variacoes
  const entrada = (
    idProduto,
    idLocalEstoque,
    idSetor,
    quantidade,
    idVariacao,
  ) =>
    post("/api/estoque/entradas", {
      idProduto,
      idLocalEstoque,
      idSetor,
      quantidade,
      ...(idVariacao ? { idVariacao } : {}),
      observacao: "Entrada física da fixture local",
    })
  const posicao = (idProduto, idLocalEstoque) =>
    prisma.estoque.findFirstOrThrow({
      where: {
        id_empresa: empresa,
        id_produto: idProduto,
        id_local_estoque: idLocalEstoque,
      },
      include: { estoque_variacao: true },
    })
  const snapshot = async () =>
    JSON.stringify({
      saldos: await prisma.estoque.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      grade: await prisma.estoque_variacao.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      reservas: await prisma.reserva_estoque.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      movimentos: await prisma.movimentacao_estoque.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      kardex: await prisma.kardex.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      entregas: await prisma.pedido_cliente_entrega.findMany({
        where: { pedido_cliente: { id_empresa: empresa } },
        orderBy: { id: "asc" },
      }),
      ordens: await prisma.ordem_producao.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      etapas: await prisma.ordem_producao_fluxo_setor.findMany({
        where: { ordem_producao: { id_empresa: empresa } },
        orderBy: { id: "asc" },
      }),
      necessidades: await prisma.necessidade_producao.findMany({
        where: { ordem_producao: { id_empresa: empresa } },
        orderBy: { id: "asc" },
      }),
      consumos: await prisma.consumo_producao.findMany({
        where: { ordem_producao: { id_empresa: empresa } },
        orderBy: { id: "asc" },
      }),
      operacoes: await prisma.operacao_erp.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
      auditoria: await prisma.auditoria.findMany({
        where: { id_empresa: empresa },
        orderBy: { id: "asc" },
      }),
    })
  const outro = { usuario: 5, empresa }
  async function postOutro(
    rota,
    body = {},
    chave = randomUUID(),
    status = 201,
  ) {
    const r = await a.chamar(rota, "POST", body, { ...outro, chave })
    assert.equal(r.status, status, `${rota}: ${JSON.stringify(r.body)}`)
    return r.body.data ?? r.body
  }
  try {
    // Segundo administrador real da fixture, também vinculado à primeira empresa.
    // As cotas de requisição continuam habilitadas durante os testes HTTP.
    const cargo = await prisma.cargos.findFirstOrThrow({
      where: { id_empresa: empresa },
    })
    await prisma.usuario_empresa.create({
      data: {
        id_usuario: a.usuarios[5],
        id_empresa: empresa,
        id_cargo: cargo.id,
      },
    })
    for (const nome of ["Tecidos", "Produtos prontos da fábrica", "Loja"])
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
    const tecido = await prisma.produtos.create({
      data: {
        id_tipo_produto: tipo,
        nome: `Tecido ${randomUUID()}`,
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
    const ficha = await prisma.ficha_tecnica.create({
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
        nome: `Fluxo ${randomUUID()}`,
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
    await entrada(tecido.id, locais[0].id, setores[0].id, "10.000")
    await entrada(produto, locais[2].id, setores[5].id, "2.000", m.id)
    await entrada(produto, locais[2].id, setores[5].id, "100.000", g.id)
    const pedido = await a.pedido({
      status: null,
      entrega: false,
      itens: [
        {
          idProduto: produto,
          idVariacao: m.id,
          quantidade: "5.000",
          precoPraticado: "10.00",
        },
      ],
    })
    const alocar = {
      origem: "PEDIDO",
      idOrigem: pedido.id,
      idItem: pedido.itens[0].id,
      idProduto: produto,
      idVariacao: m.id,
      idLocalEstoque: locais[2].id,
      quantidade: "2.000",
    }
    const chaveConfirmar = randomUUID()
    await post(
      `/api/pedidos/${pedido.id}/confirmar`,
      { reservas: [alocar] },
      chaveConfirmar,
    )
    const s1 = await snapshot()
    await post(
      `/api/pedidos/${pedido.id}/confirmar`,
      { reservas: [{ ...alocar, quantidade: "2.0" }] },
      chaveConfirmar,
      200,
    )
    assert.equal(await snapshot(), s1)
    let reserva = await prisma.reserva_estoque.findFirstOrThrow({
      where: { id_pedido_cliente_item: pedido.itens[0].id },
    })
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
      "102.000",
      "Reservar não movimenta o físico",
    )
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade_reservada.toFixed(3),
      "2.000",
    )
    assert.equal(
      (
        await a.chamar(
          "/api/estoque/reservas",
          "POST",
          { ...alocar, quantidade: "3.000" },
          { chave: randomUUID() },
        )
      ).status,
      409,
      "100 peças G não atendem falta de M",
    )
    assert.equal(await snapshot(), s1)
    op = await post("/api/ordem_producao", {
      numero: `OP-${randomUUID()}`,
      quantidade_planejada: "3.000",
      id_local_estoque: locais[1].id,
    })
    const itemOP = await post(`/api/ordem_producao/${op.id}/itens`, {
      id_produto: produto,
      id_variacao: m.id,
      quantidade: "3.000",
    })
    await post(`/api/ordem_producao/${op.id}/liberar`, {}, randomUUID(), 200)
    const reservaMaterial = await post("/api/estoque/reservas", {
      origem: "PRODUCAO",
      idOrigem: op.id,
      idProduto: tecido.id,
      idLocalEstoque: locais[0].id,
      quantidade: "6.000",
    })
    await post(`/api/ordem_producao/${op.id}/iniciar`, {}, randomUUID(), 200)
    const consumo = {
      idReserva: reservaMaterial.idReserva,
      quantidade: "6.000",
      concluirConsumo: true,
    }
    const antesConsumo = await snapshot()
    const falhaConsumo = await a.falhaControlada(
      "auditoria",
      `NEW.id_empresa = ${empresa}`,
      () =>
        a.chamar(`/api/ordem_producao/${op.id}/consumos`, "POST", consumo, {
          chave: randomUUID(),
        }),
    )
    assert.equal(falhaConsumo.status, 500)
    assert.equal(
      await snapshot(),
      antesConsumo,
      "Falha de auditoria desfaz consumo, reserva, necessidade, movimento, saldo e kardex",
    )
    const chaveConsumo = randomUUID()
    await post(`/api/ordem_producao/${op.id}/consumos`, consumo, chaveConsumo)
    const consumoConfirmado = await snapshot()
    await post(
      `/api/ordem_producao/${op.id}/consumos`,
      { ...consumo, quantidade: "6.0" },
      chaveConsumo,
      200,
    )
    assert.equal(
      await snapshot(),
      consumoConfirmado,
      "Reenvio de consumo não baixa novamente o insumo",
    )
    assert.equal(
      (await posicao(tecido.id, locais[0].id)).quantidade.toFixed(3),
      "4.000",
    )
    const etapas = await prisma.ordem_producao_fluxo_setor.findMany({
      where: { id_ordem_producao: op.id },
      orderBy: { ordem: "asc" },
    })
    for (let i = 0; i < etapas.length; i++) {
      if (i)
        await post(
          `/api/ordem_producao/${op.id}/etapas/${etapas[i].id}/iniciar`,
          {},
          randomUUID(),
          200,
        )
      if (i === etapas.length - 1) {
        const r = await a.chamar(
          `/api/ordem_producao/${op.id}/itens/${itemOP.id}/producao`,
          "PUT",
          { quantidade_produzida: "3.000", quantidade_esperada: "0" },
        )
        assert.equal(r.status, 200, JSON.stringify(r.body))
        const antesConcluir = await snapshot()
        const falhaConclusao = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresa}`,
          () =>
            a.chamar(
              `/api/ordem_producao/${op.id}/etapas/${etapas[i].id}/concluir`,
              "POST",
              {},
            ),
        )
        assert.equal(falhaConclusao.status, 500)
        assert.equal(
          await snapshot(),
          antesConcluir,
          "Falha da conclusão não confirma etapa/OP nem entrada parcial",
        )
      }
      await post(
        `/api/ordem_producao/${op.id}/etapas/${etapas[i].id}/concluir`,
        {},
        randomUUID(),
        200,
      )
    }
    assert.equal(
      (await prisma.ordem_producao.findUniqueOrThrow({ where: { id: op.id } }))
        .status,
      "CONCLUIDA",
    )
    assert.equal(
      (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
      "3.000",
    )
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
      "102.000",
      "Concluir não entrega fisicamente à loja",
    )
    const concluida = await snapshot()
    assert.equal(
      (await a.chamar(`/api/ordem_producao/${op.id}/concluir`, "POST", {}))
        .status,
      409,
    )
    assert.equal(await snapshot(), concluida)
    const transferencia = await post("/api/estoque/transferencias/enviar", {
      idProduto: produto,
      idVariacao: m.id,
      idLocalOrigem: locais[1].id,
      idSetorOrigem: setores[4].id,
      idLocalDestino: locais[2].id,
      idSetorDestino: setores[5].id,
      quantidade: "3.000",
      observacao: "Envio físico da fábrica à loja",
    })
    assert.equal(
      (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
      "0.000",
    )
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
      "102.000",
    )
    const chaveReceber = randomUUID()
    await post(
      `/api/estoque/transferencias/${transferencia.idTransferencia}/receber`,
      {},
      chaveReceber,
    )
    const recebida = await snapshot()
    await post(
      `/api/estoque/transferencias/${transferencia.idTransferencia}/receber`,
      {},
      chaveReceber,
      200,
    )
    assert.equal(await snapshot(), recebida)
    const complemento = await post("/api/estoque/reservas", {
      ...alocar,
      quantidade: "3.000",
    })
    const parcial = {
      nomeRecebedor: "Cliente da fixture",
      itens: [
        {
          idItem: pedido.itens[0].id,
          idReserva: reserva.id,
          quantidade: "2.000",
        },
      ],
    }
    const chaveEntrega = randomUUID()
    const primeira = await post(
      `/api/pedidos/${pedido.id}/entregas`,
      parcial,
      chaveEntrega,
    )
    assert.equal(primeira.status, "PARCIALMENTE_ENTREGUE")
    const entregueUmaVez = await snapshot()
    await post(`/api/pedidos/${pedido.id}/entregas`, parcial, chaveEntrega, 200)
    assert.equal(await snapshot(), entregueUmaVez)
    const completa = await post(`/api/pedidos/${pedido.id}/entregas`, {
      nomeRecebedor: "Cliente da fixture",
      itens: [
        {
          idItem: pedido.itens[0].id,
          idReserva: complemento.idReserva,
          quantidade: "3.000",
        },
      ],
    })
    assert.equal(completa.status, "ENTREGUE")
    const estoqueFinal = await posicao(produto, locais[2].id)
    assert.equal(estoqueFinal.quantidade.toFixed(3), "100.000")
    assert.equal(
      estoqueFinal.estoque_variacao
        .find((v) => v.id_variacao === m.id)
        .quantidade.toFixed(3),
      "0.000",
    )
    assert.equal(
      estoqueFinal.estoque_variacao
        .find((v) => v.id_variacao === g.id)
        .quantidade.toFixed(3),
      "100.000",
    )
    assert.equal(estoqueFinal.quantidade_reservada.toFixed(3), "0.000")
    pedido.versao = completa.versao
    assert.equal((await a.fechar(pedido)).status, 201)
    const titulo = await prisma.contas_receber.findFirstOrThrow({
      where: { venda: { id_pedido_cliente: pedido.id } },
    })
    assert.equal(titulo.valor_final.toFixed(2), "50.00")
    const banco = await prisma.contas_bancarias.create({
      data: {
        id_empresa: empresa,
        nome: `Conta ${randomUUID()}`,
        tipo: "CAIXA",
      },
    })
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    const receber = (valor) => ({
      valor,
      data: hoje,
      formaPagamento: "DINHEIRO",
      idContaBancaria: banco.id,
    })
    assert.equal(
      (
        await post(
          `/api/contas_receber/${titulo.id}/recebimentos`,
          receber("20.00"),
        )
      ).saldo,
      "30.00",
    )
    const chaveFinal = randomUUID()
    assert.equal(
      (
        await post(
          `/api/contas_receber/${titulo.id}/recebimentos`,
          receber("30.00"),
          chaveFinal,
        )
      ).situacao,
      "PAGO",
    )
    await post(
      `/api/contas_receber/${titulo.id}/recebimentos`,
      receber("30.00"),
      chaveFinal,
      200,
    )
    const stockAntesFecharDeNovo = await snapshot()
    assert.equal((await a.fechar(pedido)).status, 200)
    assert.equal(
      await snapshot(),
      stockAntesFecharDeNovo,
      "Fechamento financeiro nunca baixa estoque novamente",
    )
    assert.equal(
      await prisma.movimentacao_estoque.count({
        where: { id_empresa: empresa, tipo: "ENTRADA_PRODUCAO" },
      }),
      1,
    )
    assert.equal(
      await prisma.movimentacao_estoque.count({
        where: { id_empresa: empresa, tipo: "SAIDA_PRODUCAO" },
      }),
      1,
    )
    assert.equal(
      await prisma.movimentacao_estoque.count({
        where: { id_empresa: empresa, tipo: "SAIDA_VENDA" },
      }),
      2,
    )
    assert.equal(
      await prisma.pagamentos_receber.count({
        where: { id_conta_receber: titulo.id },
      }),
      2,
    )
    assert.equal(
      await prisma.kardex.count({ where: { id_empresa: empresa } }),
      await prisma.movimentacao_estoque.count({
        where: { id_empresa: empresa },
      }),
    )
    console.log(
      "Cenário integrado confirmado: tecido → sublimação → corte → costura → aprontamento → transferência recebida na loja → duas entregas → fechamento → dois recebimentos, sem duplicação.",
    )

    await t.test(
      "reserva parcial liberada preserva histórico e não devolve físico",
      async () => {
        const p = await a.pedido({
          status: null,
          entrega: false,
          itens: [
            {
              idProduto: produto,
              idVariacao: g.id,
              quantidade: "3.000",
              precoPraticado: "10.00",
            },
          ],
        })
        await post(`/api/pedidos/${p.id}/confirmar`, { reservas: [] })
        const r = await post("/api/estoque/reservas", {
          ...alocar,
          idOrigem: p.id,
          idItem: p.itens[0].id,
          idVariacao: g.id,
          quantidade: "3.000",
        })
        const fisico = (
          await posicao(produto, locais[2].id)
        ).quantidade.toFixed(3)
        await post(`/api/estoque/reservas/${r.idReserva}/liberar`, {
          quantidade: "1.000",
          motivo: "Redução do atendimento reservado",
        })
        reserva = await prisma.reserva_estoque.findUniqueOrThrow({
          where: { id: r.idReserva },
        })
        assert.equal(reserva.quantidade_liberada.toFixed(3), "1.000")
        assert.equal(reserva.status, "ATIVA")
        assert.equal(
          (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
          fisico,
        )
        const antes = await snapshot()
        const erro = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresa}`,
          () =>
            a.chamar(
              `/api/pedidos/${p.id}/entregas`,
              "POST",
              {
                nomeRecebedor: "Fixture",
                itens: [
                  {
                    idItem: p.itens[0].id,
                    idReserva: r.idReserva,
                    quantidade: "2.000",
                  },
                ],
              },
              { chave: randomUUID() },
            ),
        )
        assert.equal(erro.status, 500)
        assert.equal(
          await snapshot(),
          antes,
          "Entrega, movimento, saldo, grade, reserva, kardex e idempotência fazem rollback juntos",
        )
      },
    )
    await t.test(
      "duas reservas concorrentes não tomam o mesmo saldo",
      async () => {
        await entrada(produto, locais[2].id, setores[5].id, "3.000", m.id)
        const pedidos = await Promise.all([
          a.pedido({
            status: null,
            entrega: false,
            itens: [
              {
                idProduto: produto,
                idVariacao: m.id,
                quantidade: "2.000",
                precoPraticado: "10",
              },
            ],
          }),
          a.pedido({
            status: null,
            entrega: false,
            itens: [
              {
                idProduto: produto,
                idVariacao: m.id,
                quantidade: "2.000",
                precoPraticado: "10",
              },
            ],
          }),
        ])
        for (const p of pedidos)
          await post(`/api/pedidos/${p.id}/confirmar`, { reservas: [] })
        const respostas = await Promise.all(
          pedidos.map((p) =>
            a.chamar(
              "/api/estoque/reservas",
              "POST",
              { ...alocar, idOrigem: p.id, idItem: p.itens[0].id },
              { chave: randomUUID() },
            ),
          ),
        )
        assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409])
        const pos = await posicao(produto, locais[2].id)
        assert.equal(
          pos.estoque_variacao
            .find((v) => v.id_variacao === m.id)
            .quantidade_reservada.toFixed(3),
          "2.000",
        )
      },
    )
    await t.test(
      "autorização e empresa são conferidas no servidor",
      async () => {
        assert.equal(
          (
            await a.chamar("/api/estoque/reservas", "GET", undefined, {
              usuario: 1,
            })
          ).status,
          403,
        )
        assert.equal(
          (
            await a.chamar(
              `/api/pedidos/${pedido.id}/operacao`,
              "GET",
              undefined,
              { usuario: 5, empresa: empresas[1] },
            )
          ).status,
          404,
        )
        assert.equal(
          (
            await a.chamar("/api/estoque/reservas", "GET", undefined, {
              usuario: null,
            })
          ).status,
          401,
        )
      },
    )
    await t.test(
      "liberação total e cancelamento de OP preservam o físico e o histórico",
      async () => {
        const fisico = (
          await posicao(produto, locais[2].id)
        ).quantidade.toFixed(3)
        const chave = randomUUID()
        const liberar = {
          quantidade: "2.000",
          motivo: "Cancelamento da parcela ainda reservada",
        }
        await postOutro(
          `/api/estoque/reservas/${reserva.id}/liberar`,
          liberar,
          chave,
        )
        const depois = await snapshot()
        await postOutro(
          `/api/estoque/reservas/${reserva.id}/liberar`,
          liberar,
          chave,
          200,
        )
        assert.equal(await snapshot(), depois)
        const r = await prisma.reserva_estoque.findUniqueOrThrow({
          where: { id: reserva.id },
        })
        assert.equal(r.status, "CANCELADA")
        assert.equal(r.quantidade_liberada.toFixed(3), "3.000")
        assert.equal(
          (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
          fisico,
        )
        const ordem = await postOutro("/api/ordem_producao", {
          numero: `Cancelar-${randomUUID()}`,
          quantidade_planejada: "1.000",
          id_local_estoque: locais[1].id,
        })
        await postOutro(`/api/ordem_producao/${ordem.id}/itens`, {
          id_produto: produto,
          id_variacao: m.id,
          quantidade: "1.000",
        })
        await postOutro(
          `/api/ordem_producao/${ordem.id}/liberar`,
          {},
          randomUUID(),
          200,
        )
        const material = await postOutro("/api/estoque/reservas", {
          origem: "PRODUCAO",
          idOrigem: ordem.id,
          idProduto: tecido.id,
          idLocalEstoque: locais[0].id,
          quantidade: "2.000",
        })
        const antes = (
          await posicao(tecido.id, locais[0].id)
        ).quantidade.toFixed(3)
        const resposta = await a.chamar(
          `/api/ordem_producao/${ordem.id}`,
          "DELETE",
          undefined,
          outro,
        )
        assert.equal(resposta.status, 200, JSON.stringify(resposta.body))
        assert.equal(
          (
            await prisma.reserva_estoque.findUniqueOrThrow({
              where: { id: material.idReserva },
            })
          ).status,
          "CANCELADA",
        )
        assert.equal(
          (await posicao(tecido.id, locais[0].id)).quantidade.toFixed(3),
          antes,
        )
        assert.equal(
          (await posicao(tecido.id, locais[0].id)).quantidade_reservada.toFixed(
            3,
          ),
          "0.000",
        )
      },
    )
    await t.test(
      "rascunho, quantidade, produto, variação e localização inválidos não deixam efeitos",
      async () => {
        const p = await a.pedido({
          status: null,
          entrega: false,
          itens: [
            {
              idProduto: produto,
              idVariacao: g.id,
              quantidade: "2.000",
              precoPraticado: "10",
            },
          ],
        })
        const r = {
          ...alocar,
          idOrigem: p.id,
          idItem: p.itens[0].id,
          idVariacao: g.id,
          quantidade: "2.000",
        }
        let antes = await snapshot()
        await postOutro("/api/estoque/reservas", r, randomUUID(), 409)
        assert.equal(await snapshot(), antes)
        await postOutro(`/api/pedidos/${p.id}/confirmar`, { reservas: [] })
        const localAlheio = await prisma.locais_estoque.create({
          data: {
            id_empresa: empresas[1],
            nome: "Local isolado de outra empresa",
          },
        })
        antes = await snapshot()
        for (const quantidade of ["0", "-1", "1.0001", "1e2"])
          await postOutro(
            "/api/estoque/reservas",
            { ...r, quantidade },
            randomUUID(),
            400,
          )
        await postOutro(
          "/api/estoque/reservas",
          { ...r, idProduto: tecido.id },
          randomUUID(),
          404,
        )
        await postOutro(
          "/api/estoque/reservas",
          { ...r, idVariacao: m.id },
          randomUUID(),
          404,
        )
        await postOutro(
          "/api/estoque/reservas",
          { ...r, idLocalEstoque: localAlheio.id },
          randomUUID(),
          404,
        )
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "entregas concorrentes não consomem duas vezes a mesma reserva",
      async () => {
        const p = await a.pedido({
          status: null,
          entrega: false,
          itens: [
            {
              idProduto: produto,
              idVariacao: g.id,
              quantidade: "2.000",
              precoPraticado: "10",
            },
          ],
        })
        const r = await postOutro(`/api/pedidos/${p.id}/confirmar`, {
          reservas: [
            {
              ...alocar,
              idOrigem: p.id,
              idItem: p.itens[0].id,
              idVariacao: g.id,
              quantidade: "2.000",
            },
          ],
        })
        assert.ok(r)
        const reserva = await prisma.reserva_estoque.findFirstOrThrow({
          where: { id_pedido_cliente_item: p.itens[0].id },
        })
        const body = {
          nomeRecebedor: "Cliente",
          itens: [
            {
              idItem: p.itens[0].id,
              idReserva: reserva.id,
              quantidade: "2.000",
            },
          ],
        }
        const antes = (await posicao(produto, locais[2].id)).quantidade
        const respostas = await Promise.all([
          a.chamar(`/api/pedidos/${p.id}/entregas`, "POST", body, {
            ...outro,
            chave: randomUUID(),
          }),
          a.chamar(`/api/pedidos/${p.id}/entregas`, "POST", body, {
            ...outro,
            chave: randomUUID(),
          }),
        ])
        assert.deepEqual(
          respostas.map((x) => x.status).sort(),
          [201, 409],
          JSON.stringify(respostas),
        )
        assert.equal(
          (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
          antes.minus(2).toFixed(3),
        )
        assert.equal(
          await prisma.pedido_cliente_entrega.count({
            where: { id_pedido_cliente: p.id },
          }),
          1,
        )
        assert.equal(
          (
            await prisma.reserva_estoque.findUniqueOrThrow({
              where: { id: reserva.id },
            })
          ).quantidade_consumida.toFixed(3),
          "2.000",
        )
      },
    )
    await t.test(
      "consumo faltante impede concluir e material não utilizado exige confirmação sem baixa fictícia",
      async () => {
        const ordem = await postOutro("/api/ordem_producao", {
          numero: `Sem-consumo-${randomUUID()}`,
          quantidade_planejada: "1.000",
          id_local_estoque: locais[1].id,
        })
        const item = await postOutro(`/api/ordem_producao/${ordem.id}/itens`, {
          id_produto: produto,
          id_variacao: m.id,
          quantidade: "1.000",
        })
        await postOutro(
          `/api/ordem_producao/${ordem.id}/liberar`,
          {},
          randomUUID(),
          200,
        )
        const reserva = await postOutro("/api/estoque/reservas", {
          origem: "PRODUCAO",
          idOrigem: ordem.id,
          idProduto: tecido.id,
          idLocalEstoque: locais[0].id,
          quantidade: "2.000",
        })
        await postOutro(
          `/api/ordem_producao/${ordem.id}/iniciar`,
          {},
          randomUUID(),
          200,
        )
        const etapas = await prisma.ordem_producao_fluxo_setor.findMany({
          where: { id_ordem_producao: ordem.id },
          orderBy: { ordem: "asc" },
        })
        for (let i = 0; i < etapas.length; i++) {
          if (i)
            await postOutro(
              `/api/ordem_producao/${ordem.id}/etapas/${etapas[i].id}/iniciar`,
              {},
              randomUUID(),
              200,
            )
          if (i < etapas.length - 1)
            await postOutro(
              `/api/ordem_producao/${ordem.id}/etapas/${etapas[i].id}/concluir`,
              {},
              randomUUID(),
              200,
            )
        }
        const apontamento = await a.chamar(
          `/api/ordem_producao/${ordem.id}/itens/${item.id}/producao`,
          "PUT",
          { quantidade_produzida: "1.000", quantidade_esperada: "0" },
          outro,
        )
        assert.equal(apontamento.status, 200, JSON.stringify(apontamento.body))
        const rota = `/api/ordem_producao/${ordem.id}/etapas/${etapas.at(-1).id}/concluir`
        const antes = await snapshot()
        await postOutro(rota, {}, randomUUID(), 409)
        const body = { idReserva: reserva.idReserva, quantidade: "0.000" }
        await postOutro(
          `/api/ordem_producao/${ordem.id}/consumos`,
          body,
          randomUUID(),
          400,
        )
        await postOutro(
          `/api/ordem_producao/${ordem.id}/consumos`,
          { ...body, concluirConsumo: true },
          randomUUID(),
          400,
        )
        assert.equal(await snapshot(), antes)
        const fisico = (
          await posicao(tecido.id, locais[0].id)
        ).quantidade.toFixed(3)
        const chave = randomUUID()
        const confirmar = {
          ...body,
          concluirConsumo: true,
          motivoDivergencia:
            "Operador confirmou material não utilizado nesta produção",
        }
        const resultado = await postOutro(
          `/api/ordem_producao/${ordem.id}/consumos`,
          confirmar,
          chave,
        )
        assert.equal(resultado.idConsumo, null)
        assert.equal(resultado.idMovimentacao, null)
        const depois = await snapshot()
        await postOutro(
          `/api/ordem_producao/${ordem.id}/consumos`,
          confirmar,
          chave,
          200,
        )
        assert.equal(await snapshot(), depois)
        assert.equal(
          (await posicao(tecido.id, locais[0].id)).quantidade.toFixed(3),
          fisico,
        )
        assert.equal(
          await prisma.consumo_producao.count({
            where: { id_ordem_producao: ordem.id },
          }),
          0,
        )
        const material = await prisma.reserva_estoque.findUniqueOrThrow({
          where: { id: reserva.idReserva },
        })
        assert.equal(material.quantidade_consumida.toFixed(3), "0.000")
        assert.equal(material.quantidade_liberada.toFixed(3), "2.000")
        await postOutro(rota, {}, randomUUID(), 200)
        assert.equal(
          (
            await prisma.ordem_producao.findUniqueOrThrow({
              where: { id: ordem.id },
            })
          ).status,
          "CONCLUIDA",
        )
        assert.equal(
          (await posicao(tecido.id, locais[0].id)).quantidade.toFixed(3),
          fisico,
        )
      },
    )
    assert.ok(ficha.id)
  } finally {
    const scope = { in: empresas }
    await prisma.operacao_erp.deleteMany({ where: { id_empresa: scope } })
    await prisma.transferencia_estoque.deleteMany({
      where: { id_empresa: scope },
    })
    await prisma.consumo_producao.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.reserva_estoque.deleteMany({ where: { id_empresa: scope } })
    await prisma.necessidade_producao.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao_apontamento.deleteMany({
      where: { ordem_producao_item: { ordem_producao: { id_empresa: scope } } },
    })
    await prisma.ordem_producao_movimentacao_item.deleteMany({
      where: { ordem_producao_item: { ordem_producao: { id_empresa: scope } } },
    })
    await prisma.ordem_producao_movimentacao_setor.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao_consumo_planejado.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao_snapshot.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao_fluxo_setor.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao_item.deleteMany({
      where: { ordem_producao: { id_empresa: scope } },
    })
    await prisma.ordem_producao.deleteMany({ where: { id_empresa: scope } })
    await prisma.produto_fluxo.deleteMany({ where: { id_empresa: scope } })
    await prisma.fluxo_producao_setor.deleteMany({
      where: { fluxos_producao: { id_empresa: scope } },
    })
    await prisma.fluxos_producao.deleteMany({ where: { id_empresa: scope } })
    await prisma.estoque_variacao.deleteMany({ where: { id_empresa: scope } })
    await prisma.kardex.deleteMany({ where: { id_empresa: scope } })
    await prisma.movimentacao_estoque.deleteMany({
      where: { id_empresa: scope },
    })
    await prisma.estoque.deleteMany({ where: { id_empresa: scope } })
    await prisma.ficha_tecnica_item.deleteMany({
      where: { ficha_tecnica: { id_empresa: scope } },
    })
    await prisma.ficha_tecnica.deleteMany({ where: { id_empresa: scope } })
    await prisma.setores.deleteMany({ where: { id_empresa: scope } })
    await a.encerrar()
  }
})
