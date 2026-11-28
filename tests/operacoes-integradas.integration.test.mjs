import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

test("Três cards HTTP reais: reserva, produção, transferência, entrega, fechamento e recebimento", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas } = a
  const empresa = empresas[0]
  const locais = [],
    setores = []
  let op
  async function post(rota, body = {}, chave = randomUUID(), status = 201) {
    let r = await a.chamar(rota, "POST", body, { chave })
    if (r.status === 429 && status !== 429) {
      console.log(
        "Fixture aguardando a renovação da janela antes de repetir a mesma operação.",
      )
      await new Promise((resolve) => setTimeout(resolve, 60100))
      r = await a.chamar(rota, "POST", body, { chave })
    }
    assert.equal(r.status, status, `${rota}: ${JSON.stringify(r.body)}`)
    return r.body.data ?? r.body
  }
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const produto = a.produtos[1]
  const [m, g] = a.variacoes
  async function kardex(filtros = {}) {
    const resposta = await a.chamar(
      `/api/estoque/kardex?${new URLSearchParams(filtros)}`,
    )
    assert.equal(resposta.status, 200, JSON.stringify(resposta.body))
    return resposta.body
  }
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
    for (const nome of [
      "Tecidos",
      "Produtos prontos da fábrica",
      "Loja",
      "Loja de conferência",
    ])
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
      "Conferência da loja",
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
          create: { id_produto_componente: tecido.id, quantidade: "0.600" },
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
    const fornecedor = await prisma.fornecedores.create({
      data: { id_empresa: empresa, razao_social: "Fornecedor do tecido" },
    })
    const { compra } = await post("/api/compras/compras", {
      idFornecedor: fornecedor.id,
      idLocalEstoque: locais[0].id,
      itens: [
        { idProduto: tecido.id, quantidade: "10.000", valorUnitario: "2.00" },
      ],
    })
    await post(
      `/api/compras/compras/${compra.id}/receber`,
      { idSetorDestino: setores[0].id },
      randomUUID(),
      200,
    )
    const livroCompra = await kardex({
      idProduto: tecido.id,
      idLocalEstoque: locais[0].id,
      origemTipo: "COMPRA_RECEBIMENTO",
      origemId: compra.id,
    })
    assert.deepEqual(
      livroCompra.dados.map((r) => [
        r.tipo,
        r.quantidade,
        r.origem,
        r.observacao,
      ]),
      [
        [
          "ENTRADA_NF",
          "10.000",
          { tipo: "COMPRA_RECEBIMENTO", id: compra.id },
          null,
        ],
      ],
    )
    assert.equal(livroCompra.resumo.saldos.fechamento, "10.000")
    await entrada(produto, locais[2].id, setores[5].id, "2.000", m.id)
    await entrada(produto, locais[2].id, setores[5].id, "100.000", g.id)
    const livroAntesReserva = await kardex({
      idProduto: produto,
      idLocalEstoque: locais[2].id,
    })
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
    assert.deepEqual(
      await kardex({ idProduto: produto, idLocalEstoque: locais[2].id }),
      livroAntesReserva,
    )
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
    const rotaOrdens = "/api/ordens-producao"
    const opcoes = await a.chamar(`${rotaOrdens}/opcoes`)
    assert.equal(opcoes.status, 200)
    assert.ok(
      opcoes.body.data.produtos.some(
        (p) =>
          p.id === produto && p.produto_variacoes.some((v) => v.id === m.id),
      ),
    )
    assert.ok(opcoes.body.data.locais.some((l) => l.id === locais[1].id))
    const abertura = {
      idProduto: produto,
      idVariacao: m.id,
      idLocal: locais[1].id,
      quantidade: "10.000",
    }
    const chaveAbertura = randomUUID()
    const cabecalhoNumerico = await post("/api/ordem_producao", { numero: "1" })
    op = (await post(rotaOrdens, abertura, chaveAbertura)).ordem
    assert.equal(op.numero, "2")
    assert.equal(
      (await post(rotaOrdens, abertura, chaveAbertura, 200)).ordem.id,
      op.id,
    )
    await post(
      rotaOrdens,
      { ...abertura, quantidade: "4.000" },
      chaveAbertura,
      409,
    )
    assert.equal(
      await prisma.ordem_producao.count({ where: { id_empresa: empresa } }),
      2,
    )
    const itemOP = op.ordem_producao_item[0]
    const listar = (filtros = "", opcoes = {}) =>
      a.chamar(rotaOrdens + "/resumo" + filtros, "GET", undefined, opcoes)
    const resumo = await listar("?status=PLANEJADA&page=1&limit=1")
    assert.equal(resumo.status, 200)
    assert.equal(resumo.body.data.count, 2)
    assert.equal(resumo.body.data.rows[0].id, op.id)
    assert.equal(resumo.body.data.rows[0].quantidade_planejada, "10")
    assert.equal(resumo.body.data.rows[0].etapaAtual.ordem, 1)
    assert.equal(resumo.body.data.rows[0].itens[0].quantidade_produzida, "0")
    const outraCor = await prisma.cores.create({
      data: { id_empresa: empresas[1], nome: "Cor da outra empresa" },
    })
    const outroTamanho = await prisma.tamanhos.create({
      data: { id_empresa: empresas[1], nome: "Tamanho da outra empresa" },
    })
    try {
      await prisma.ordem_producao_item.update({
        where: { id: itemOP.id },
        data: { id_cor: outraCor.id, id_tamanho: outroTamanho.id },
      })
      const legado = await listar("?page=1&limit=1")
      assert.equal(legado.status, 200)
      const dimensoes = legado.body.data.rows[0].itens[0]
      assert.equal(dimensoes.id_cor, null)
      assert.equal(dimensoes.id_tamanho, null)
      assert.equal(dimensoes.cores, null)
      assert.equal(dimensoes.tamanhos, null)
    } finally {
      await prisma.ordem_producao_item.update({
        where: { id: itemOP.id },
        data: { id_cor: itemOP.id_cor, id_tamanho: itemOP.id_tamanho },
      })
    }
    assert.equal((await listar("?page=0")).status, 400)
    assert.equal((await listar("?status=INEXISTENTE")).status, 400)
    assert.equal((await listar("", { usuario: null })).status, 401)
    assert.equal((await listar("", { usuario: 1 })).status, 403)
    const outroContexto = { usuario: 5, empresa: empresas[1] }
    assert.deepEqual((await listar("", outroContexto)).body.data.rows, [])
    const previsao = new Date("2027-01-01T00:00:00Z")
    const outrasOrdens = []
    for (const numero of ["EMPRESA-B-01", "EMPRESA-B-02"]) {
      outrasOrdens.push(
        await prisma.ordem_producao.create({
          data: {
            id_empresa: empresas[1],
            id_usuario: a.usuarios[5],
            numero,
            data_previsao: previsao,
          },
        }),
      )
    }
    for (const [i, ordem] of outrasOrdens.entries()) {
      const resultado = await listar(
        `?ordenar_por=data_previsao&ordem=asc&page=${i + 1}&limit=1`,
        outroContexto,
      )
      assert.equal(resultado.status, 200)
      assert.equal(resultado.body.data.count, 2)
      assert.deepEqual(
        resultado.body.data.rows.map((linha) => linha.id),
        [ordem.id],
      )
    }
    assert.deepEqual(
      (await listar()).body.data.rows.map((linha) => linha.id),
      [op.id, cabecalhoNumerico.id],
    )
    assert.equal(
      (
        await a.chamar(
          `${rotaOrdens}/${op.id}`,
          "GET",
          undefined,
          outroContexto,
        )
      ).status,
      404,
    )
    const editar = (observacao, chave) =>
      a.chamar(
        `${rotaOrdens}/${op.id}`,
        "PATCH",
        {
          statusEsperado: "PLANEJADA",
          observacao,
        },
        { chave },
      )
    const chaveEdicao = randomUUID()
    assert.equal((await editar("Edição original", chaveEdicao)).status, 200)
    assert.equal((await editar("Edição posterior", randomUUID())).status, 200)
    assert.equal((await editar("Edição original", chaveEdicao)).status, 200)
    assert.equal(
      (await a.chamar(`${rotaOrdens}/${op.id}`)).body.ordem.observacao,
      "Edição posterior",
    )
    await post(
      `${rotaOrdens}/${op.id}/avancar`,
      {
        statusEsperado: "PLANEJADA",
        setorEsperado: null,
        statusDestino: "LIBERADA",
      },
      randomUUID(),
      200,
    )
    const reservaMaterial = await post("/api/estoque/reservas", {
      origem: "PRODUCAO",
      idOrigem: op.id,
      idProduto: tecido.id,
      idLocalEstoque: locais[0].id,
      quantidade: "6.000",
    })
    const primeiraEtapa =
      await prisma.ordem_producao_fluxo_setor.findFirstOrThrow({
        where: { id_ordem_producao: op.id },
        orderBy: { ordem: "asc" },
      })
    await post(
      `${rotaOrdens}/${op.id}/etapas/iniciar`,
      {
        etapaId: primeiraEtapa.id,
      },
      randomUUID(),
      200,
    )
    const rotaAvanco = `${rotaOrdens}/${op.id}/avancar`
    const pausa = {
      statusEsperado: "EM_PRODUCAO",
      setorEsperado: primeiraEtapa.id_setor,
      statusDestino: "PAUSADA",
    }
    const chavePausa = randomUUID()
    await post(rotaAvanco, pausa, chavePausa, 200)
    await post(
      rotaAvanco,
      {
        ...pausa,
        statusEsperado: "PAUSADA",
        statusDestino: "EM_PRODUCAO",
      },
      randomUUID(),
      200,
    )
    assert.equal(
      (await post(rotaAvanco, pausa, chavePausa, 200)).ordem.status,
      "PAUSADA",
    )
    assert.equal(
      (await a.chamar(`${rotaOrdens}/${op.id}`)).body.ordem.status,
      "EM_PRODUCAO",
    )
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
          `${rotaOrdens}/${op.id}/etapas/iniciar`,
          { etapaId: etapas[i].id },
          randomUUID(),
          200,
        )
      const rotaApontar = `/api/ordens-producao/${op.id}/apontamentos`
      const dados = {
        idEtapa: etapas[i].id,
        idItem: itemOP.id,
        quantidadeProduzida: "10.000",
        quantidadePerdida: "0.000",
        dataApontamento: dia,
      }
      const chaveApontar = randomUUID()
      const apontamento = await post(rotaApontar, dados, chaveApontar)
      if (i === etapas.length - 1) {
        const replay = await post(rotaApontar, dados, chaveApontar, 200)
        assert.equal(replay.apontamento.id, apontamento.apontamento.id)
        const r = await a.chamar(
          `/api/ordem_producao/${op.id}/itens/${itemOP.id}/producao`,
          "PUT",
          { quantidade_produzida: "10.000", quantidade_esperada: "0" },
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
      const rotaConcluir = `${rotaOrdens}/${op.id}/etapas/concluir`
      const confirmacao = { etapaId: etapas[i].id }
      const chaveConclusao = randomUUID()
      if (i === etapas.length - 1) {
        assert.equal(
          (
            await a.chamar(rotaConcluir, "POST", confirmacao, {
              chave: chaveConclusao,
              descartarResposta: true,
            })
          ).status,
          200,
        )
        const depoisDaConclusao = await snapshot()
        const concluida = await post(
          rotaConcluir,
          confirmacao,
          chaveConclusao,
          200,
        )
        assert.equal(concluida.ordem.status, "CONCLUIDA")
        assert.deepEqual(
          await post(rotaConcluir, confirmacao, chaveConclusao, 200),
          concluida,
        )
        await post(rotaConcluir, { etapaId: etapas[0].id }, chaveConclusao, 409)
        await post(rotaConcluir, confirmacao, randomUUID(), 409)
        assert.equal(await snapshot(), depoisDaConclusao)
      } else await post(rotaConcluir, confirmacao, chaveConclusao, 200)
    }
    assert.equal(
      (await prisma.ordem_producao.findUniqueOrThrow({ where: { id: op.id } }))
        .status,
      "CONCLUIDA",
    )
    assert.equal(
      (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
      "10.000",
    )
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
      "102.000",
      "Concluir não entrega fisicamente à loja",
    )
    const movimentosOP = await prisma.movimentacao_estoque.findMany({
      where: {
        id_empresa: empresa,
        origem_id: op.id,
        origem_tipo: { in: ["CONSUMO_PRODUCAO", "ORDEM_PRODUCAO"] },
      },
      orderBy: { id: "asc" },
    })
    assert.deepEqual(
      movimentosOP.map((m) => [m.tipo, m.quantidade.toFixed(3)]),
      [
        ["SAIDA_PRODUCAO", "6.000"],
        ["ENTRADA_PRODUCAO", "10.000"],
      ],
    )
    for (const mov of movimentosOP) {
      const registro = await kardex({
        idProduto: mov.id_produto,
        idLocalEstoque: mov.id_local_estoque,
        origemTipo: mov.origem_tipo,
        origemId: op.id,
      })
      assert.equal(registro.dados[0].idMovimentacao, mov.id)
      assert.equal(registro.dados[0].tipo, mov.tipo)
      assert.equal(
        registro.resumo.saldos.fechamento,
        mov.tipo === "SAIDA_PRODUCAO" ? "4.000" : "10.000",
      )
    }
    assert.equal(
      await prisma.kardex.count({
        where: { id_movimentacao: { in: movimentosOP.map((m) => m.id) } },
      }),
      2,
    )
    assert.equal(
      await prisma.ordem_producao_apontamento.count({
        where: {
          id_ordem_producao: op.id,
          id_ordem_producao_item: itemOP.id,
          id_setor: etapas.at(-1).id_setor,
        },
      }),
      1,
    )
    console.log(
      "Consumo, apontamento final e conclusão confirmados com uma saída, uma entrada e dois Kardex.",
    )
    const concluida = await snapshot()
    await postOutro(
      `/api/ordem_producao/${op.id}/concluir`,
      {},
      randomUUID(),
      409,
    )
    assert.equal(await snapshot(), concluida)
    await t.test(
      "expedição de 6 das 10 peças da OP e conferência real em loja vazia",
      async () => {
        const rotaEnvio = "/api/estoque/transferencias/enviar"
        const dados = {
          idProduto: produto,
          idVariacao: m.id,
          idLocalOrigem: locais[1].id,
          idSetorOrigem: setores[4].id,
          idLocalDestino: locais[3].id,
          idSetorDestino: setores[6].id,
          quantidade: "6.000",
          observacao: "Expedição das peças prontas",
        }
        const saldoLoja = async () => {
          const r = await a.chamar(
            `/api/estoque/saldo?idProduto=${produto}&idLocalEstoque=${locais[3].id}`,
          )
          assert.equal(r.status, 200)
          return r.body.saldo
        }
        assert.equal(await saldoLoja(), "0.000")
        assert.equal(
          (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
          "10.000",
        )

        const antesEnvio = await snapshot()
        const falhaEnvio = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresa}`,
          () => a.chamar(rotaEnvio, "POST", dados, { chave: randomUUID() }),
        )
        assert.equal(falhaEnvio.status, 500)
        assert.equal(await snapshot(), antesEnvio)
        await post(
          rotaEnvio,
          { ...dados, idSetorOrigem: setores[5].id },
          randomUUID(),
          409,
        )
        await post(
          rotaEnvio,
          { ...dados, idLocalDestino: locais[2].id },
          randomUUID(),
          409,
        )
        await post(
          rotaEnvio,
          {
            ...dados,
            idLocalOrigem: locais[2].id,
            idSetorOrigem: setores[5].id,
            quantidade: "1.000",
          },
          randomUUID(),
          409,
        )
        assert.equal(await snapshot(), antesEnvio)

        const chave = randomUUID()
        const descartada = await a.chamar(rotaEnvio, "POST", dados, {
          chave,
          descartarResposta: true,
        })
        assert.equal(descartada.status, 201)
        const enviado = await post(
          rotaEnvio,
          { ...dados, quantidade: "6.0" },
          chave,
          200,
        )
        await post(rotaEnvio, { ...dados, quantidade: "7.000" }, chave, 409)
        assert.equal(
          (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
          "4.000",
        )
        assert.equal(await saldoLoja(), "0.000")

        const antesRecuperar = await snapshot()
        const headers = { "X-Recuperar-Transferencia": "1" }
        const conhecida = await a.chamar(rotaEnvio, "POST", dados, {
          chave,
          headers,
        })
        assert.equal(conhecida.status, 200)
        assert.deepEqual(conhecida.body.data, enviado)
        for (const opts of [{ chave: randomUUID() }, { ...outro, chave }]) {
          const recusada = await a.chamar(rotaEnvio, "POST", dados, {
            ...opts,
            headers,
          })
          assert.equal(recusada.status, 404)
          assert.equal(recusada.body.code, "RECUPERACAO_INDISPONIVEL")
        }
        const conflitoLocal = await post(
          rotaEnvio,
          {
            ...dados,
            idSetorDestino: setores[2].id,
            quantidade: "1.000",
          },
          randomUUID(),
          409,
        )
        assert.equal(conflitoLocal.code, "TRANSFERENCIA_RECUSADA")
        const conflitoSetor = await post(
          rotaEnvio,
          {
            ...dados,
            idLocalDestino: locais[0].id,
            quantidade: "1.000",
          },
          randomUUID(),
          409,
        )
        assert.equal(conflitoSetor.code, "TRANSFERENCIA_RECUSADA")
        assert.equal(
          (await posicao(produto, locais[3].id)).quantidade.toFixed(3),
          "0.000",
        )
        assert.equal(await snapshot(), antesRecuperar)
        const rotaConsulta = "/api/estoque/transferencias"
        const lista = await a.chamar(
          `${rotaConsulta}?status=ENVIADA&idLocalDestino=${locais[3].id}&limite=1`,
        )
        assert.equal(lista.status, 200)
        assert.equal(lista.body.data.total, 1)
        assert.equal(lista.body.data.dados[0].id, enviado.idTransferencia)
        assert.equal(lista.body.data.dados[0].quantidade, "6.000")
        assert.equal(lista.body.data.dados[0].origem.local, locais[1].nome)
        assert.equal(lista.body.data.dados[0].destino.local, locais[3].nome)
        assert.equal(lista.body.data.dados[0].produto.unidade, "UN")
        assert.ok(lista.body.data.dados[0].enviadoPor)
        assert.deepEqual(
          (await a.chamar(rotaConsulta, "GET", undefined, outroContexto)).body
            .data.dados,
          [],
        )
        assert.equal(
          (
            await a.chamar(rotaConsulta, "GET", undefined, {
              empresa: empresas[1],
            })
          ).status,
          403,
        )
        assert.equal(
          (await a.chamar(rotaConsulta, "GET", undefined, { usuario: null }))
            .status,
          401,
        )

        const rotaReceber = `${rotaConsulta}/${enviado.idTransferencia}/receber`
        const antesReceber = await snapshot()
        for (const invalido of [
          {},
          { quantidade: "abc" },
          { quantidade: "6.0001" },
          { quantidade: "-1" },
          { quantidade: "6", idLocalDestino: locais[2].id },
        ])
          await post(rotaReceber, invalido, randomUUID(), 400)
        for (const quantidade of ["0", "5.000", "7.000"]) {
          const recusa = await post(
            rotaReceber,
            { quantidade },
            randomUUID(),
            409,
          )
          assert.equal(recusa.code, "TRANSFERENCIA_RECUSADA")
        }
        const estrangeira = await a.chamar(
          rotaReceber,
          "POST",
          { quantidade: "6" },
          { ...outroContexto, chave: randomUUID() },
        )
        assert.equal(estrangeira.status, 404)
        const semPermissao = await a.chamar(
          rotaReceber,
          "POST",
          { quantidade: "6" },
          { usuario: 1, chave: randomUUID() },
        )
        assert.equal(semPermissao.status, 403)
        const reservaEmTransito = await a.chamar(
          "/api/estoque/reservas",
          "POST",
          {
            ...alocar,
            idLocalEstoque: locais[3].id,
            quantidade: "1.000",
          },
          { chave: randomUUID() },
        )
        assert.equal(reservaEmTransito.status, 409)
        assert.equal(await saldoLoja(), "0.000")
        assert.equal(await snapshot(), antesReceber)

        const falhaEntrada = await a.falhaControlada(
          "auditoria",
          `NEW.id_empresa = ${empresa}`,
          () =>
            a.chamar(
              rotaReceber,
              "POST",
              { quantidade: "6" },
              { chave: randomUUID() },
            ),
        )
        assert.equal(falhaEntrada.status, 500)
        assert.equal(await snapshot(), antesReceber)

        const chaveReceber = randomUUID()
        const [a1, a2] = await Promise.all([
          a.chamar(
            rotaReceber,
            "POST",
            { quantidade: "6.000" },
            { chave: chaveReceber, descartarResposta: true },
          ),
          postOutro(rotaReceber, { quantidade: "6" }),
        ])
        assert.equal(a1.status, 201)
        const recuperada = await post(
          rotaReceber,
          { quantidade: "6.0" },
          chaveReceber,
          200,
        )
        assert.deepEqual(recuperada, a2)
        const chaveLegada = randomUUID()
        const tipoLegado = `receberTransferencia:${enviado.idTransferencia}`
        const idUsuario = a.usuarios[0]
        await prisma.operacao_erp.create({
          data: {
            id_empresa: empresa,
            id_usuario: idUsuario,
            chave: chaveLegada,
            tipo: tipoLegado,
            hash: createHash("sha256")
              .update(
                JSON.stringify({ tipo: tipoLegado, idUsuario, input: {} }),
              )
              .digest("hex"),
            resultado: recuperada,
          },
        })
        const antesReplayLegado = await snapshot()
        assert.deepEqual(
          await post(rotaReceber, {}, chaveLegada, 200),
          recuperada,
        )
        await post(rotaReceber, {}, randomUUID(), 400)
        assert.equal(await snapshot(), antesReplayLegado)
        await post(rotaReceber, { quantidade: "5" }, randomUUID(), 409)
        assert.equal(await saldoLoja(), "6.000")
        assert.equal(
          (await posicao(produto, locais[1].id)).quantidade.toFixed(3),
          "4.000",
        )
        const auditoria = await prisma.auditoria.findMany({
          where: {
            id_empresa: empresa,
            tabela: "transferencia_estoque",
            id_registro: enviado.idTransferencia,
          },
          orderBy: { id: "asc" },
        })
        assert.deepEqual(
          auditoria.map((r) => r.acao),
          ["INSERT", "UPDATE"],
        )
        assert.equal(
          JSON.parse(auditoria[1].dados_novos).quantidadeConferida,
          "6.000",
        )
        const entrada = await kardex({
          origemTipo: "TRANSFERENCIA_RECEBIMENTO",
          origemId: enviado.idTransferencia,
        })
        assert.equal(entrada.dados.length, 1)
        assert.equal(
          entrada.dados[0].idMovimentacao,
          recuperada.idMovimentoEntrada,
        )
        assert.equal(
          entrada.dados[0].idMovimentoRelacionado,
          enviado.idMovimentoSaida,
        )
        assert.equal(
          (
            await a.chamar(
              `${rotaConsulta}?status=ENVIADA&idLocalDestino=${locais[3].id}`,
            )
          ).body.data.total,
          0,
        )
        const historico = await a.chamar(
          `${rotaConsulta}?status=RECEBIDA&idTransferencia=${enviado.idTransferencia}`,
        )
        assert.equal(historico.body.data.total, 1)
        assert.ok(historico.body.data.dados[0].recebidoPor)
      },
    )

    await prisma.ficha_tecnica_item.updateMany({
      where: { id_ficha_tecnica: ficha.id },
      data: { quantidade: "2.000" },
    })

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
      "1.000",
    )
    assert.equal(
      (await posicao(produto, locais[2].id)).quantidade.toFixed(3),
      "102.000",
    )
    const chaveReceber = randomUUID()
    const envio = await kardex({
      origemTipo: "TRANSFERENCIA_ENVIO",
      origemId: transferencia.idTransferencia,
    })
    assert.equal(envio.dados[0].idMovimentacao, transferencia.idMovimentoSaida)
    assert.equal(envio.dados[0].idMovimentoRelacionado, null)
    assert.deepEqual(
      (
        await kardex({
          origemTipo: "TRANSFERENCIA_RECEBIMENTO",
          origemId: transferencia.idTransferencia,
        })
      ).dados,
      [],
    )
    const chegada = await post(
      `/api/estoque/transferencias/${transferencia.idTransferencia}/receber`,
      { quantidade: "3.000" },
      chaveReceber,
    )
    const recebidoKardex = await kardex({
      origemTipo: "TRANSFERENCIA_RECEBIMENTO",
      origemId: transferencia.idTransferencia,
    })
    assert.equal(
      recebidoKardex.dados[0].idMovimentacao,
      chegada.idMovimentoEntrada,
    )
    assert.equal(
      recebidoKardex.dados[0].idMovimentoRelacionado,
      transferencia.idMovimentoSaida,
    )
    assert.equal(
      (await kardex({ idMovimentacao: transferencia.idMovimentoSaida }))
        .dados[0].idMovimentoRelacionado,
      chegada.idMovimentoEntrada,
    )
    const recebida = await snapshot()
    await post(
      `/api/estoque/transferencias/${transferencia.idTransferencia}/receber`,
      { quantidade: "3.000" },
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
    const chaveRecusada = randomUUID()
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const recusa = await post(
        `/api/pedidos/${pedido.id}/entregas`,
        parcial,
        chaveRecusada,
        409,
      )
      assert.equal(recusa.code, "ENTREGA_RECUSADA")
      assert.equal(await snapshot(), entregueUmaVez)
    }
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
    const livroEntrega = await kardex({
      idProduto: produto,
      idLocalEstoque: locais[2].id,
      origemTipo: "PEDIDO_ENTREGA",
    })
    assert.deepEqual(
      livroEntrega.dados.map((r) => [r.direcao, r.quantidade]),
      [
        ["SAIDA", "3.000"],
        ["SAIDA", "2.000"],
      ],
    )
    assert.equal(livroEntrega.resumo.saldos.fechamento, "100.000")
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
    await t.test(
      "perda integral encerra a OP sem entrada fictícia de produto acabado",
      async () => {
        const ordem = await post("/api/ordem_producao", {
          numero: `Perda-total-${randomUUID()}`,
          quantidade_planejada: "1.000",
        })
        const item = await post(`/api/ordem_producao/${ordem.id}/itens`, {
          id_produto: produto,
          id_variacao: m.id,
          quantidade: "1.000",
        })
        // A inclusão atual exige a grade. A perda também precisa cobrir uma ordem legada sem essas referências.
        await prisma.ordem_producao_item.update({
          where: { id: item.id },
          data: { id_cor: null, id_tamanho: null, tamanho: "UNICO" },
        })
        const rota = `/api/ordem_producao/${ordem.id}`
        await post(`${rota}/liberar`, {}, randomUUID(), 409)
        const localIncompativel = await a.chamar(rota, "PATCH", {
          id_local_estoque: locais[2].id,
        })
        assert.equal(localIncompativel.status, 200)
        const incompatibilidade = await post(
          `${rota}/liberar`,
          {},
          randomUUID(),
          409,
        )
        assert.match(incompatibilidade.error, /incompatível/)
        const localValido = await a.chamar(rota, "PATCH", {
          id_local_estoque: locais[1].id,
        })
        assert.equal(localValido.status, 200)
        const gradeAusente = await post(
          `${rota}/liberar`,
          {},
          randomUUID(),
          409,
        )
        assert.match(gradeAusente.error, /variação válida/)
        await post(
          `${rota}/regularizar`,
          {
            variacoes: [{ idItem: item.id, idVariacao: m.id }],
            motivo: "Identificação da grade planejada",
          },
          randomUUID(),
          200,
        )
        await post(
          `/api/ordem_producao/${ordem.id}/liberar`,
          {},
          randomUUID(),
          200,
        )
        await entrada(tecido.id, locais[0].id, setores[0].id, "2.000")
        const reserva = await post("/api/estoque/reservas", {
          origem: "PRODUCAO",
          idOrigem: ordem.id,
          idProduto: tecido.id,
          idLocalEstoque: locais[0].id,
          quantidade: "2.000",
        })
        await post(
          `/api/ordem_producao/${ordem.id}/iniciar`,
          {},
          randomUUID(),
          200,
        )
        const operacao = `/api/ordem_producao/${ordem.id}/operacao`
        const detalhe = `/api/ordens-producao/${ordem.id}`
        const antesDaPerda = await a.chamar(operacao)
        assert.equal(antesDaPerda.status, 200)
        assert.deepEqual(antesDaPerda.body.data.itensComPerdaIntegral, [])
        const etapas = await prisma.ordem_producao_fluxo_setor.findMany({
          where: { id_ordem_producao: ordem.id },
          orderBy: { ordem: "asc" },
        })
        await post(`/api/ordens-producao/${ordem.id}/apontamentos`, {
          idEtapa: etapas[0].id,
          idItem: item.id,
          quantidadeProduzida: "0.000",
          quantidadePerdida: "1.000",
          motivoPerda: "Perda integral da unidade planejada na fixture",
          dataApontamento: dia,
        })
        const comPerda = await a.chamar(operacao)
        assert.equal(comPerda.status, 200)
        assert.deepEqual(comPerda.body.data.itensComPerdaIntegral, [item.id])
        // Simula uma conclusão administrativa anterior à integração de estoque.
        await prisma.ordem_producao.update({
          where: { id: ordem.id },
          data: { status: "CONCLUIDA", data_conclusao: new Date() },
        })
        try {
          const antiga = await a.chamar(detalhe)
          assert.equal(antiga.status, 200)
          assert.equal(antiga.body.baixaEstoque, "pendente_regularizacao")
        } finally {
          await prisma.ordem_producao.update({
            where: { id: ordem.id },
            data: { status: "EM_PRODUCAO", data_conclusao: null },
          })
        }
        await post(`/api/ordem_producao/${ordem.id}/consumos`, {
          idReserva: reserva.idReserva,
          quantidade: "2.000",
          concluirConsumo: true,
        })
        // Simula uma OP em curso legada, com fatos preservados e destino ausente.
        await prisma.ordem_producao.update({
          where: { id: ordem.id },
          data: { id_local_estoque: null },
        })
        const destino = {
          idLocal: locais[1].id,
          motivo: "Completar destino da OP legada",
        }
        const negada = await a.chamar(`${rota}/regularizar`, "POST", destino, {
          usuario: 1,
        })
        assert.equal(negada.status, 403)
        const fatos = async () => {
          const {
            saldos,
            grade,
            reservas,
            movimentos,
            kardex,
            etapas,
            consumos,
          } = JSON.parse(await snapshot())
          return {
            saldos,
            grade,
            reservas,
            movimentos,
            kardex,
            etapas,
            consumos,
          }
        }
        const saldoAntes = await fatos()
        await post(`${rota}/regularizar`, destino, randomUUID(), 200)
        assert.deepEqual(await fatos(), saldoAntes)
        assert.deepEqual(
          (await a.chamar(operacao)).body.data.itensComPerdaIntegral,
          [item.id],
        )
        const trilha = await prisma.auditoria.findFirstOrThrow({
          where: {
            id_empresa: empresa,
            tabela: "ordem_producao",
            id_registro: ordem.id,
          },
          orderBy: { id: "desc" },
        })
        assert.equal(trilha.id_usuario, a.usuarios[0])
        assert.equal(JSON.parse(trilha.dados_anteriores).local, null)
        assert.equal(JSON.parse(trilha.dados_novos).motivo, destino.motivo)
        for (const [i, etapa] of etapas.entries()) {
          if (i)
            await post(
              `/api/ordem_producao/${ordem.id}/etapas/${etapa.id}/iniciar`,
              {},
              randomUUID(),
              200,
            )
          await post(
            `/api/ordem_producao/${ordem.id}/etapas/${etapa.id}/concluir`,
            {},
            randomUUID(),
            200,
          )
        }
        const consulta = await a.chamar(detalhe)
        assert.equal(consulta.status, 200)
        assert.equal(consulta.body.ordem.status, "CONCLUIDA")
        assert.equal(consulta.body.baixaEstoque, "efetivada")
        await post(`${rota}/concluir`, {}, randomUUID(), 409)
        const auditoria = await prisma.auditoria.findFirstOrThrow({
          where: {
            id_empresa: empresa,
            tabela: "ordem_producao",
            id_registro: ordem.id,
          },
          orderBy: { id: "desc" },
        })
        const efeitos = JSON.parse(auditoria.dados_novos).estoque
        assert.equal(efeitos.entradaProdutos.situacao, "EFETIVADA")
        assert.deepEqual(efeitos.entradaProdutos.movimentos, [])
        assert.equal(efeitos.consumoInsumos.situacao, "CONFIRMADO")
        const movimentos = await prisma.movimentacao_estoque.findMany({
          where: {
            id_empresa: empresa,
            origem_id: ordem.id,
            origem_tipo: { in: ["CONSUMO_PRODUCAO", "ORDEM_PRODUCAO"] },
          },
        })
        assert.deepEqual(
          movimentos.map((mov) => [mov.tipo, mov.quantidade.toFixed(3)]),
          [["SAIDA_PRODUCAO", "2.000"]],
        )
        const consumo = movimentos[0]
        assert.equal(
          await prisma.kardex.count({
            where: { id_movimentacao: consumo.id },
          }),
          1,
        )
        await prisma.movimentacao_estoque.update({
          where: { id: consumo.id },
          data: { origem_id: ordem.id + 1 },
        })
        try {
          const origemIncorreta = await a.chamar(detalhe)
          assert.equal(origemIncorreta.status, 200)
          assert.equal(
            origemIncorreta.body.baixaEstoque,
            "pendente_regularizacao",
          )
        } finally {
          await prisma.movimentacao_estoque.update({
            where: { id: consumo.id },
            data: { origem_id: ordem.id },
          })
        }
      },
    )
    await t.test(
      "OP preserva itens e planejamento com decimais equivalentes",
      async () => {
        const id = cabecalhoNumerico.id
        const rota = `/api/ordem_producao/${id}/itens`
        const primeira = await post(rota, {
          id_produto: produto,
          id_variacao: m.id,
          quantidade: "3",
        })
        const ajusteCabecalho = await a.chamar(`${rotaOrdens}/${id}`, "PATCH", {
          statusEsperado: "PLANEJADA",
          quantidade: "3.000",
        })
        assert.equal(ajusteCabecalho.status, 200)
        assert.equal(ajusteCabecalho.body.ordem.quantidade_planejada, "3")
        await post(rota, {
          id_produto: produto,
          id_variacao: g.id,
          quantidade: "2",
        })
        const planejamento = () =>
          prisma.ordem_producao_item.findMany({
            where: { id_ordem_producao: id },
            orderBy: { id: "asc" },
            include: { ordem_producao_consumo_planejado: true },
          })
        const anterior = await planejamento()
        await prisma.ficha_tecnica_item.updateMany({
          where: { id_ficha_tecnica: ficha.id },
          data: { quantidade: "5" },
        })
        const alterarOrdem = (quantidade) =>
          a.chamar(`${rotaOrdens}/${id}`, "PATCH", {
            statusEsperado: "PLANEJADA",
            quantidade,
            observacao: "Ajuste sem alterar a composição",
          })
        const editarItem = (quantidade) =>
          a.chamar(`${rota}/${primeira.id}`, "PATCH", {
            quantidade,
          })
        assert.equal((await alterarOrdem("3.000")).status, 200)
        assert.equal((await editarItem("3.000")).status, 200)
        assert.deepEqual(await planejamento(), anterior)
        assert.equal((await alterarOrdem("3.001")).status, 409)
        assert.equal((await editarItem("3.001")).status, 200)
        const atual = await planejamento()
        assert.equal(
          atual[0].ordem_producao_consumo_planejado[0].quantidade_necessaria.toFixed(
            3,
          ),
          "15.005",
        )
        assert.deepEqual(atual[1], anterior[1])
      },
    )

    await t.test(
      "Opções de OP usam cota de leitura e exibem somente grades válidas",
      async () => {
        const cor = await prisma.cores.create({
          data: { id_empresa: empresa, nome: "Inativa", status: "INATIVA" },
        })
        const corAtiva = await prisma.cores.create({
          data: { id_empresa: empresa, nome: "Ativa" },
        })
        const tamanho = await prisma.tamanhos.create({
          data: { id_empresa: empresa, nome: "Inativo", status: "INATIVO" },
        })
        const variante = (dados) =>
          prisma.produto_variacoes.create({
            data: { id_empresa: empresa, id_produto: produto, ...dados },
          })
        const invalidaCor = await variante({ id_cor: cor.id })
        const invalidaTamanho = await variante({
          id_tamanho: tamanho.id,
          id_cor: corAtiva.id,
        })
        const somenteCor = await variante({ id_cor: corAtiva.id })
        const contexto = { usuario: 5, empresa }
        const buscar = () =>
          a.chamar(`${rotaOrdens}/opcoes`, "GET", undefined, contexto)
        const opcoes = await buscar()
        const disponiveis = opcoes.body.data.produtos
          .find((p) => p.id === produto)
          .produto_variacoes.map((v) => v.id)
        assert.ok(
          disponiveis.includes(m.id) && disponiveis.includes(somenteCor.id),
        )
        assert.ok(
          !disponiveis.includes(invalidaCor.id) &&
            !disponiveis.includes(invalidaTamanho.id),
        )
        const abrir = (dados) =>
          a.chamar(rotaOrdens, "POST", dados, {
            ...contexto,
            chave: randomUUID(),
          })
        assert.equal(
          (await abrir({ ...abertura, idVariacao: invalidaCor.id })).status,
          400,
        )
        assert.equal(
          (await abrir({ ...abertura, idVariacao: invalidaTamanho.id })).status,
          400,
        )
        let consultas = 1
        while (consultas <= 120) {
          const consulta = await buscar()
          if (consulta.status === 429) break
          assert.equal(consulta.status, 200)
          consultas++
        }
        assert.ok(
          consultas > 30 && consultas <= 120,
          `Buscas antes do limite: ${consultas}`,
        )
        const ordemValida = await abrir({
          ...abertura,
          idVariacao: somenteCor.id,
        })
        assert.equal(ordemValida.status, 201, JSON.stringify(ordemValida.body))
        let esgotou = false
        for (let i = 0; i < 30 && !esgotou; i++) {
          const resposta = await abrir(abertura)
          esgotou = resposta.status === 429
          if (!esgotou) assert.equal(resposta.status, 201)
        }
        assert.ok(esgotou, "A cota de escrita continua sendo aplicada.")
      },
    )

    await t.test(
      "card OP: abertura com previsão hoje, edição e início da primeira etapa",
      async () => {
        const criada = await post("/api/ordens-producao", {
          idProduto: produto,
          quantidade: "1.000",
          tamanho: "UNICO",
          prioridade: "NORMAL",
          observacao: "Validação HTTP do card",
          dataPrevisao: `${dia}T00:00:00.000Z`,
        })
        const id = criada.ordem.id
        const listagem = await a.chamar(
          `/api/ordens-producao?page=1&limit=25&numero=${encodeURIComponent(criada.ordem.numero)}`,
        )
        assert.equal(listagem.status, 200)
        const linha = listagem.body.data.rows.find((row) => row.id === id)
        assert.equal(linha?.observacao, "Validação HTTP do card")
        const editar = await a.chamar(`/api/ordens-producao/${id}`, "PATCH", {
          statusEsperado: "PLANEJADA",
          quantidade: "2.000",
          tamanho: "UNICO",
          prioridade: "ALTA",
          observacao: "Edição persistida pelo card",
        })
        assert.equal(editar.status, 200, JSON.stringify(editar.body))
        const detalhe = await a.chamar(`/api/ordens-producao/${id}`)
        assert.equal(detalhe.status, 200)
        assert.equal(
          detalhe.body.ordem.observacao,
          "Edição persistida pelo card",
        )
        assert.equal(detalhe.body.ordem.quantidade_planejada, "2")
        const persistida = await prisma.ordem_producao.findUniqueOrThrow({
          where: { id },
        })
        assert.equal(persistida.quantidade_planejada.toFixed(3), "2.000")
        await post(
          `/api/ordem_producao/${id}/regularizar`,
          {
            motivo: "Destino da fixture de previsão para hoje",
            idLocal: locais[1].id,
            variacoes: [
              {
                idItem: criada.ordem.ordem_producao_item[0].id,
                idVariacao: m.id,
              },
            ],
          },
          randomUUID(),
          200,
        )
        await post(`/api/ordem_producao/${id}/liberar`, {}, randomUUID(), 200)
        const [primeiraEtapa] =
          await prisma.ordem_producao_fluxo_setor.findMany({
            where: { id_ordem_producao: id },
            orderBy: { ordem: "asc" },
          })
        await post(
          `/api/ordem_producao/${id}/etapas/${primeiraEtapa.id}/iniciar`,
          {},
          randomUUID(),
          200,
        )
        const iniciada = await prisma.ordem_producao.findUniqueOrThrow({
          where: { id },
        })
        assert.equal(iniciada.status, "EM_PRODUCAO")
        assert.ok(iniciada.data_inicio)
        assert.equal(
          iniciada.data_previsao.toISOString(),
          persistida.data_previsao.toISOString(),
        )
        const semLogin = await a.chamar(
          "/api/ordens-producao",
          "GET",
          undefined,
          { usuario: null },
        )
        assert.equal(semLogin.status, 401)
      },
    )
    await t.test(
      "expedições concorrentes respeitam o saldo exato e a grade",
      async () => {
        const novo = await prisma.produtos.create({
          data: {
            id_tipo_produto: tipo,
            nome: `Tecido fracionável ${randomUUID()}`,
            codigo: randomUUID(),
            unidade: "M",
            produto_empresa: { create: { id_empresa: empresa } },
          },
        })
        a.produtos.push(novo.id)
        const [disponivel, outraVariacao] = await Promise.all(
          [m, g].map((v) =>
            prisma.produto_variacoes.create({
              data: {
                id_empresa: empresa,
                id_produto: novo.id,
                id_cor: v.id_cor,
                id_tamanho: v.id_tamanho,
              },
            }),
          ),
        )
        const localExterno = await prisma.locais_estoque.create({
          data: { id_empresa: empresas[1], nome: "Local externo" },
        })
        await entrada(
          novo.id,
          locais[1].id,
          setores[4].id,
          "0.300",
          disponivel.id,
        )
        const rota = "/api/estoque/transferencias/enviar"
        const dados = {
          idProduto: novo.id,
          idVariacao: disponivel.id,
          idLocalOrigem: locais[1].id,
          idSetorOrigem: setores[4].id,
          idLocalDestino: locais[3].id,
          idSetorDestino: setores[6].id,
          quantidade: "0.200",
          observacao: "Expedição fracionável",
        }
        const antes = await snapshot()
        await post(
          rota,
          { ...dados, idVariacao: outraVariacao.id },
          randomUUID(),
          409,
        )
        await post(
          rota,
          { ...dados, idLocalDestino: localExterno.id },
          randomUUID(),
          404,
        )
        assert.equal(await snapshot(), antes)
        const concorrentes = await Promise.all([
          a.chamar(rota, "POST", dados, { chave: randomUUID() }),
          a.chamar(rota, "POST", dados, { ...outro, chave: randomUUID() }),
        ])
        assert.deepEqual(concorrentes.map((r) => r.status).sort(), [201, 409])
        const linha = await prisma.transferencia_estoque.findFirstOrThrow({
          where: { id_empresa: empresa, id_produto: novo.id },
        })
        assert.equal(
          await prisma.transferencia_estoque.count({
            where: { id_empresa: empresa, id_produto: novo.id },
          }),
          1,
        )
        assert.equal(
          (await posicao(novo.id, locais[1].id)).quantidade.toFixed(3),
          "0.100",
        )
        await postOutro(`/api/estoque/transferencias/${linha.id}/receber`, {
          quantidade: "0.2",
        })
        assert.equal(
          (await posicao(novo.id, locais[3].id)).quantidade.toFixed(3),
          "0.200",
        )
        const seguinte = await postOutro(rota, {
          ...dados,
          quantidade: "0.100",
        })
        assert.notEqual(seguinte.idTransferencia, linha.id)
        const posicaoDestino = await posicao(novo.id, locais[3].id)
        assert.equal(posicaoDestino.id_setor, setores[6].id)
        assert.equal(posicaoDestino.quantidade.toFixed(3), "0.200")
        assert.equal(
          (await posicao(novo.id, locais[1].id)).quantidade.toFixed(3),
          "0.000",
        )
      },
    )

    await t.test(
      "sessão revogada bloqueia consulta e confirmação de transferências",
      async () => {
        const revogada = await a.chamar("/api/auth/logout", "POST", undefined, {
          usuario: 5,
        })
        assert.ok(revogada.status === 200 || revogada.status === 204)
        const consulta = await a.chamar(
          "/api/estoque/transferencias",
          "GET",
          undefined,
          outro,
        )
        const tentativa = await a.chamar(
          `/api/estoque/transferencias/${transferencia.idTransferencia}/receber`,
          "POST",
          { quantidade: "3" },
          { ...outro, chave: randomUUID() },
        )
        assert.equal(consulta.status, 401)
        assert.equal(tentativa.status, 401)
      },
    )
  } finally {
    const scope = { in: empresas }
    await prisma.compra_recebimento_linha?.deleteMany({
      where: { id_empresa: scope },
    })
    await prisma.compra_itens.deleteMany({
      where: { compras: { id_empresa: scope } },
    })
    await prisma.compras.deleteMany({ where: { id_empresa: scope } })
    await prisma.fornecedores.deleteMany({ where: { id_empresa: scope } })
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
    await prisma.producao_confirmacao.deleteMany({
      where: { id_empresa: scope },
    })
    await prisma.producao_apontamento_evento.deleteMany({
      where: { id_empresa: scope },
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
