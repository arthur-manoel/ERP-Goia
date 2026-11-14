import assert from "node:assert/strict"
import { test } from "node:test"
import { ambienteRecebiveis } from "./helpers/integracao-recebiveis.mjs"

const hoje = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
}).format(new Date())
const dia = (dias) =>
  new Date(Date.parse(hoje + "T00:00:00Z") + dias * 86400000)
    .toISOString()
    .slice(0, 10)
const rota = "/api/estoque/kardex"

test("Kardex por HTTP real e MariaDB isolado", async (t) => {
  const a = await ambienteRecebiveis()
  const { prisma, empresas, produtos, variacoes, usuarios } = a
  const [empresa, outra] = empresas
  const [idProduto, produtoGrade] = produtos
  const [m, g] = variacoes

  const listar = (filtros = {}, op = {}) =>
    a.chamar(`${rota}?${new URLSearchParams(filtros)}`, "GET", undefined, op)
  async function ler(filtros, op) {
    const r = await listar(filtros, op)
    assert.equal(r.status, 200, JSON.stringify(r.body))
    return r.body
  }
  async function posicao(id_empresa, nome) {
    const local = await prisma.locais_estoque.create({
      data: { id_empresa, nome },
    })
    const setor = await prisma.setores.create({ data: { id_empresa, nome } })
    return { idLocalEstoque: local.id, idSetor: setor.id }
  }
  async function mover(caminho, dados, op = {}) {
    const r = await a.chamar(
      `/api/estoque/${caminho}`,
      "POST",
      {
        observacao: "Movimento físico de teste",
        ...dados,
      },
      op,
    )
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body
  }
  const janela = { dataInicio: dia(-3), dataFim: hoje }
  const filtroDia = { dataInicio: hoje, dataFim: hoje }
  const optsOutra = { empresa: outra, usuario: 5 }
  const escopo = { id_empresa: { in: empresas } }
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all([
        prisma.estoque.findMany({ where: escopo, orderBy: { id: "asc" } }),
        prisma.estoque_variacao.findMany({
          where: escopo,
          orderBy: { id: "asc" },
        }),
        prisma.reserva_estoque.findMany({
          where: escopo,
          orderBy: { id: "asc" },
        }),
        prisma.movimentacao_estoque.findMany({
          where: escopo,
          orderBy: { id: "asc" },
        }),
        prisma.kardex.findMany({ where: escopo, orderBy: { id: "asc" } }),
      ]),
    )

  try {
    const [fusoBanco] = await prisma.$queryRaw`
      SELECT @@session.time_zone AS sessao, @@system_time_zone AS sistema`
    console.log("Fuso da sessão MariaDB", fusoBanco)
    const local = await posicao(empresa, "Local Kardex")
    const localOutro = await posicao(outra, "Outra empresa")
    const localAdicional = await posicao(empresa, "Segundo local")
    const filtro = { idProduto, ...local }
    const db = {
      id_empresa: empresa,
      id_produto: idProduto,
      id_local_estoque: local.idLocalEstoque,
      id_setor: local.idSetor,
    }

    await t.test(
      "histórico legado, abertura retrodatada e equação independente do filtro",
      async () => {
        const estoque = await prisma.estoque.create({
          data: { ...db, quantidade: "12.300" },
        })
        const antes = await snapshot()
        const vazio = await ler({ ...filtro, ...janela })
        assert.deepEqual(vazio.dados, [])
        assert.equal(vazio.resumo.motivo, "SEM_LANCAMENTOS")
        assert.equal(await snapshot(), antes)
        const data = new Date(dia(-2) + "T03:00:00Z")
        const segundos = data.getTime() / 1000
        const mov = await prisma.movimentacao_estoque.create({
          data: {
            ...db,
            id_usuario: usuarios[0],
            tipo: "ENTRADA_NF",
            quantidade: "2.300",
            origem_tipo: "COMPRA_RECEBIMENTO",
            origem_id: 72,
          },
        })
        const k = await prisma.kardex.create({
          data: {
            ...db,
            id_movimentacao: mov.id,
            tipo_movimentacao: "ENTRADA",
            quantidade: "2.300",
            saldo_anterior: "10.000",
            saldo_atual: "12.300",
          },
        })
        await prisma.$executeRaw`
          UPDATE movimentacao_estoque SET data_movimentacao = FROM_UNIXTIME(${segundos})
          WHERE id = ${mov.id} AND id_empresa = ${empresa}`
        await prisma.$executeRaw`
          UPDATE kardex SET data_movimentacao = FROM_UNIXTIME(${segundos})
          WHERE id = ${k.id} AND id_empresa = ${empresa}`
        assert.equal((await ler({ ...filtro, ...janela })).resumo.saldos, null)
        await mover("saidas", { ...filtro, quantidade: "1.200" })
        const r = await ler({ ...filtro, ...janela })
        const inicial = r.dados.at(-1)
        assert.equal(inicial.origem.tipo, "SALDO_INICIAL")
        assert.ok(inicial.id > k.id)
        assert.ok(new Date(inicial.dataMovimentacao) < data)
        const saidas = await ler({ ...filtro, ...janela, direcao: "SAIDA" })
        assert.deepEqual(
          saidas.dados.map((x) => [
            x.delta,
            x.saldo.anterior,
            x.saldo.posterior,
          ]),
          [["-1.200", "12.300", "11.100"]],
        )
        assert.deepEqual(saidas.resumo.saldos, {
          abertura: "0.000",
          entradas: "12.300",
          saidas: "1.200",
          fechamento: "11.100",
        })
        const comAbertura = await ler({
          ...filtro,
          dataInicio: dia(-2),
          dataFim: hoje,
          direcao: "SAIDA",
        })
        assert.deepEqual(comAbertura.resumo.saldos, {
          abertura: "10.000",
          entradas: "2.300",
          saidas: "1.200",
          fechamento: "11.100",
        })
        const antesCompra = await ler({
          ...filtro,
          dataInicio: dia(-3),
          dataFim: dia(-3),
        })
        assert.deepEqual(
          antesCompra.dados.map((linha) => linha.origem.tipo),
          ["SALDO_INICIAL"],
        )
        const diaCompra = await ler({
          ...filtro,
          dataInicio: dia(-2),
          dataFim: dia(-2),
        })
        assert.deepEqual(
          diaCompra.dados.map((linha) => linha.dataMovimentacao),
          [data.toISOString()],
        )
        const semMovimento = await ler({
          ...filtro,
          dataInicio: dia(1),
          dataFim: dia(1),
        })
        assert.deepEqual(semMovimento.resumo.saldos, {
          abertura: "11.100",
          entradas: "0.000",
          saidas: "0.000",
          fechamento: "11.100",
        })
        const antesHistorico = await ler({
          ...filtro,
          dataInicio: dia(-4),
          dataFim: dia(-4),
        })
        assert.equal(
          antesHistorico.resumo.motivo,
          "PERIODO_ANTERIOR_AO_HISTORICO",
        )
        assert.equal(
          (
            await prisma.estoque.findUnique({ where: { id: estoque.id } })
          ).quantidade.toFixed(3),
          "11.100",
        )
        const ajuste = await mover("ajustes", {
          ...filtro,
          saldoEsperado: "11.100",
          saldoNovo: "10.900",
        })
        const ajusteLivro = (
          await ler({ idMovimentacao: ajuste.idMovimentacao })
        ).dados[0]
        assert.equal(ajusteLivro.delta, "-0.200")
        assert.deepEqual(ajusteLivro.origem, { tipo: "API_AJUSTE", id: null })
        assert.equal(ajusteLivro.observacao, "Movimento físico de teste")
        assert.equal(ajusteLivro.variacao, null)
      },
    )

    await t.test(
      "decimais, variações, isolamento, filtros e empate na paginação",
      async () => {
        const grade = { idProduto: produtoGrade, ...local }
        const primeiro = await mover("entradas", {
          ...grade,
          idVariacao: m.id,
          quantidade: "0.300",
        })
        await mover("saidas", {
          ...grade,
          idVariacao: m.id,
          quantidade: "0.200",
        })
        const terceiro = await mover("entradas", {
          ...grade,
          idVariacao: g.id,
          quantidade: "0.500",
        })
        await mover("entradas", {
          ...filtro,
          ...localAdicional,
          quantidade: "7.000",
        })
        const registroAlheio = await mover(
          "entradas",
          { idProduto, ...localOutro, quantidade: "8.000" },
          optsOutra,
        )
        const instante = new Date(hoje + "T12:00:00Z")
        await prisma.kardex.updateMany({
          where: {
            id_empresa: empresa,
            id_produto: produtoGrade,
            id_local_estoque: local.idLocalEstoque,
          },
          data: { data_movimentacao: instante },
        })
        const menor = await ler({ ...grade, idVariacao: m.id })
        assert.equal(menor.dados[0].saldo.posterior, "0.100")
        assert.equal(menor.dados[0].saldo.escopo, "POSICAO_AGREGADA")
        assert.equal(menor.dados[0].variacao.tamanho, "M")
        assert.equal(menor.resumo.saldos.fechamento, "0.600")
        const um = await ler({ ...grade, limite: 2 })
        const dois = await ler({ ...grade, limite: 2, pagina: 2 })
        assert.equal(um.paginacao.totalRegistros, 3)
        assert.equal(um.dados[0].idMovimentacao, terceiro.idMovimentacao)
        assert.equal(dois.dados[0].idMovimentacao, primeiro.idMovimentacao)
        assert.deepEqual(
          (await ler({ ...grade, limite: 2, pagina: 3 })).dados,
          [],
        )
        assert.equal(
          (await listar({ idProduto, idVariacao: m.id })).status,
          400,
        )
        assert.equal(
          (await listar({ idLocalEstoque: localOutro.idLocalEstoque })).status,
          404,
        )
        assert.deepEqual(
          (await ler({ idMovimentacao: registroAlheio.idMovimentacao })).dados,
          [],
        )
        assert.equal(
          (await ler({ ...localOutro, idProduto }, optsOutra)).resumo.saldos
            .fechamento,
          "8.000",
        )
        assert.equal((await listar({}, { usuario: null })).status, 401)
        assert.equal((await listar({}, { usuario: 1 })).status, 403)
        assert.equal((await listar({}, { usuario: 4 })).status, 200)
        assert.equal(
          (await listar({ tipo: "SAIDA_VENDA", direcao: "ENTRADA" })).status,
          400,
        )
        assert.equal((await listar({ origemId: 72 })).status, 400)
        assert.equal((await a.chamar(`${rota}?pagina=1&pagina=2`)).status, 400)
        await prisma.locais_estoque.update({
          where: { id: local.idLocalEstoque },
          data: { status: "INATIVO" },
        })
        assert.equal((await ler(grade)).paginacao.totalRegistros, 3)
        await prisma.locais_estoque.update({
          where: { id: local.idLocalEstoque },
          data: { status: "ATIVO" },
        })
      },
    )

    await t.test(
      "movimento órfão, divergências e posição legada sem reparo por GET",
      async () => {
        const k = await prisma.kardex.findFirstOrThrow({
          where: db,
          orderBy: { id: "desc" },
        })
        await prisma.kardex.update({
          where: { id: k.id },
          data: { tipo_movimentacao: "ENTRADA" },
        })
        const divergente = await ler({ ...filtro, ...janela })
        assert.equal(divergente.resumo.motivo, "CADEIA_DIVERGENTE")
        assert.equal(
          divergente.dados.find((r) => r.id === k.id).saldo.posterior,
          null,
        )
        await prisma.kardex.update({
          where: { id: k.id },
          data: {
            tipo_movimentacao: "SAIDA",
            saldo_anterior: "12.000",
            saldo_atual: "11.800",
          },
        })
        assert.equal((await ler(filtro)).resumo.motivo, "CADEIA_DIVERGENTE")
        await prisma.kardex.update({
          where: { id: k.id },
          data: {
            saldo_anterior: k.saldo_anterior,
            saldo_atual: k.saldo_atual,
          },
        })
        await prisma.estoque.updateMany({
          where: db,
          data: { quantidade: "11.000" },
        })
        assert.equal((await ler(filtro)).resumo.motivo, "PROJECAO_DIVERGENTE")
        await prisma.estoque.updateMany({
          where: db,
          data: { quantidade: "10.900" },
        })
        const orfao = await prisma.movimentacao_estoque.create({
          data: {
            ...db,
            id_usuario: usuarios[0],
            tipo: "AJUSTE_ENTRADA",
            quantidade: "0.100",
          },
        })
        const antes = await snapshot()
        const resposta = await ler(filtro)
        assert.equal(resposta.resumo.motivo, "VINCULO_OU_POSICAO_INCOMPLETA")
        assert.deepEqual(await ler(filtro), resposta)
        assert.equal(await snapshot(), antes)
        assert.deepEqual((await ler({ idMovimentacao: orfao.id })).dados, [])
        await prisma.movimentacao_estoque.delete({ where: { id: orfao.id } })
        const { id_tipo_produto } = await prisma.produtos.findUniqueOrThrow({
          where: { id: idProduto },
        })
        const produtoExclusivo = await prisma.produtos.create({
          data: {
            id_tipo_produto,
            nome: "Produto exclusivo da outra empresa",
            codigo: `KARDEX-EXCLUSIVO-${outra}`,
          },
        })
        a.produtos.push(produtoExclusivo.id)
        await prisma.produto_empresa.create({
          data: { id_empresa: outra, id_produto: produtoExclusivo.id },
        })
        const movimentoOutraEmpresa = await prisma.movimentacao_estoque.create({
          data: {
            id_empresa: outra,
            id_produto: produtoExclusivo.id,
            id_local_estoque: localOutro.idLocalEstoque,
            id_setor: localOutro.idSetor,
            id_usuario: usuarios[5],
            tipo: "AJUSTE_ENTRADA",
            quantidade: "1",
            origem_tipo: "API_ENTRADA",
            observacao: "Observação restrita à outra empresa",
          },
        })
        const inconsistente = await prisma.kardex.create({
          data: {
            ...db,
            id_produto: produtoExclusivo.id,
            id_movimentacao: movimentoOutraEmpresa.id,
            tipo_movimentacao: "ENTRADA",
            quantidade: "1",
            saldo_anterior: "10.900",
            saldo_atual: "11.900",
          },
        })
        const protegido = (
          await ler({ idLocalEstoque: local.idLocalEstoque })
        ).dados.find((linha) => linha.id === inconsistente.id)
        assert.equal(protegido.saldo.situacao, "DIVERGENTE")
        assert.equal(protegido.idMovimentacao, null)
        assert.equal(protegido.origem, null)
        assert.equal(protegido.observacao, null)
        assert.equal(protegido.produto, null)
        assert.equal(protegido.quantidade, null)
        assert.equal(
          (await listar({ idProduto: produtoExclusivo.id })).status,
          404,
        )
        assert.deepEqual(
          (await ler({ idMovimentacao: movimentoOutraEmpresa.id })).dados,
          [],
        )
        await prisma.kardex.delete({ where: { id: inconsistente.id } })
        await prisma.movimentacao_estoque.delete({
          where: { id: movimentoOutraEmpresa.id },
        })
        const semLocal = await prisma.movimentacao_estoque.create({
          data: {
            id_empresa: empresa,
            id_produto: idProduto,
            id_usuario: usuarios[0],
            tipo: "AJUSTE_ENTRADA",
            quantidade: "1",
          },
        })
        await prisma.kardex.create({
          data: {
            id_empresa: empresa,
            id_produto: idProduto,
            id_movimentacao: semLocal.id,
            tipo_movimentacao: "ENTRADA",
            quantidade: "1",
            saldo_anterior: "0",
            saldo_atual: "1",
          },
        })
        const legado = (await ler({ idMovimentacao: semLocal.id })).dados[0]
        assert.equal(legado.localEstoque, null)
        assert.equal(legado.setor, null)
        assert.equal(legado.saldo.posterior, "1.000")
        assert.equal(
          (await ler(filtro)).resumo.motivo,
          "VINCULO_OU_POSICAO_INCOMPLETA",
        )
      },
    )

    await t.test(
      "escrita concorrente preserva página, contagem e resumo no mesmo snapshot",
      async () => {
        const alvo = { idProduto, ...localOutro }
        for (let i = 0; i < 3; i++) {
          const [lido] = await Promise.all([
            ler({ ...alvo, ...filtroDia }, optsOutra),
            mover("entradas", { ...alvo, quantidade: "0.100" }, optsOutra),
          ])
          assert.equal(lido.paginacao.totalRegistros, lido.dados.length)
          assert.equal(
            lido.resumo.saldos.fechamento,
            lido.dados[0].saldo.posterior,
          )
        }
        assert.equal(
          (await ler(alvo, optsOutra)).resumo.saldos.fechamento,
          "8.300",
        )
      },
    )

    await t.test(
      "EXPLAIN e página de 100 registros em histórico de 20 mil",
      async () => {
        const volume = await posicao(outra, "Posição de volume")
        const filtroVolume = { idProduto, ...volume, ...janela, limite: 100 }
        const { idLocalEstoque, idSetor } = volume
        await prisma.$executeRaw`
        INSERT INTO movimentacao_estoque
          (id_empresa, id_produto, id_local_estoque, id_setor, id_usuario, tipo, quantidade,
            origem_tipo, origem_id, data_movimentacao)
        SELECT ${outra}, ${idProduto}, ${idLocalEstoque}, ${idSetor}, ${usuarios[5]},
          'AJUSTE_ENTRADA', 1, 'KARDEX_VOLUME_FIXTURE', seq,
          TIMESTAMPADD(SECOND, -seq, CURRENT_TIMESTAMP)
        FROM seq_1_to_20000`
        await prisma.$executeRaw`
        INSERT INTO kardex (id_empresa, id_produto, id_local_estoque, id_setor,
          id_movimentacao, tipo_movimentacao, quantidade, saldo_anterior, saldo_atual, data_movimentacao)
        SELECT id_empresa, id_produto, id_local_estoque, id_setor, id, 'ENTRADA', 1,
          20000 - origem_id, 20001 - origem_id, data_movimentacao
        FROM movimentacao_estoque WHERE id_empresa = ${outra}
          AND id_local_estoque = ${idLocalEstoque} AND origem_tipo = 'KARDEX_VOLUME_FIXTURE'`
        await prisma.estoque.create({
          data: {
            id_empresa: outra,
            id_produto: idProduto,
            id_local_estoque: idLocalEstoque,
            id_setor: idSetor,
            quantidade: "20000",
          },
        })
        const { Prisma } = await import("../src/generated/prisma/client.ts")
        const { consultaPagina, consultaProva } =
          await import("../src/modules/kardex/kardex.repository.ts")
        const { validarConsulta } =
          await import("../src/modules/kardex/kardex.schema.ts")
        const entrada = validarConsulta(
          Object.fromEntries(new URLSearchParams(filtroVolume)),
        )
        for (const consulta of [
          consultaPagina(outra, entrada),
          consultaProva(outra, entrada, idSetor),
        ]) {
          const plano = await prisma.$queryRaw(Prisma.sql`EXPLAIN ${consulta}`)
          assert.ok(plano.some((linha) => linha.table === "k"))
          console.log(
            "EXPLAIN",
            plano
              .filter((linha) => ["k", "m"].includes(linha.table))
              .map(({ table, type, key, rows, Extra }) => ({
                table,
                type,
                key,
                rows: Number(rows),
                Extra,
              })),
          )
        }
        const inicio = performance.now()
        const r = await ler(filtroVolume, optsOutra)
        console.log(
          "Kardex 20.000 registros, página 100, tempo HTTP em ms",
          Math.round(performance.now() - inicio),
        )
        assert.equal(r.paginacao.totalRegistros, 20000)
        assert.equal(r.dados.length, 100)
        assert.equal(r.resumo.saldos.fechamento, "20000.000")
      },
    )
  } finally {
    await prisma.estoque_variacao.deleteMany({ where: escopo })
    await prisma.kardex.deleteMany({ where: escopo })
    await prisma.movimentacao_estoque.deleteMany({ where: escopo })
    await prisma.estoque.deleteMany({ where: escopo })
    await prisma.setores.deleteMany({ where: escopo })
    await a.encerrar()
  }
})
