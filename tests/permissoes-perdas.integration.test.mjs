import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import mariadb from "mariadb"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"

const url = bancoLocal(process.env.PERMISSOES_PERDAS_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = "local-permissoes-perdas-" + randomUUID()
delete process.env.DEV_ID_USUARIO
delete process.env.DEV_ID_EMPRESA
const hooks = typescript()
const { prisma } = await import("../src/lib/prisma.ts")
const { signAccessToken } = await import("../src/modules/auth/auth.service.ts")
const { allowedCompanies } = await import("../modules/catalogos/repository.ts")
const { RECURSOS_PERMISSAO } = await import("../src/lib/permissoes.ts")
const { diaOperacional } =
  await import("../src/modules/apontamentos/apontamentos.regras.ts")
const { resetRateLimitsForTests } = await import("../src/lib/api/rate-limit.ts")
const modoHttp =
  process.env.PERMISSOES_PERDAS_TEST_HTTP === "1" ||
  process.argv.includes("--http")
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
})

test("Permissões e perdas: persistência, constraints, concorrência e contrato real", async (t) => {
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = [],
    vinculos = [],
    setores = []
  const marker = randomUUID().slice(0, 8)
  let server, base, trigger
  try {
    for (let i = 0; i < 2; i++) {
      const e = await prisma.empresas.create({
        data: {
          razao_social: `Permissões ${marker} ${i}`,
          cnpj: `${Date.now()}${i}`,
        },
      })
      empresas.push(e.id)
      const cargo = await prisma.cargos.create({
        data: { id_empresa: e.id, nome: "Produção" },
      })
      const u = await prisma.usuarios.create({
        data: {
          nome: "Teste local",
          email: `${marker}-${i}@perdas.example.test`,
          senha: "fixture-sem-login",
        },
      })
      usuarios.push(u.id)
      vinculos.push(
        (
          await prisma.usuario_empresa.create({
            data: { id_usuario: u.id, id_empresa: e.id, id_cargo: cargo.id },
          })
        ).id,
      )
      for (let n = 0; n < 3; n++)
        setores.push(
          (
            await prisma.setores.create({
              data: { id_empresa: e.id, nome: `Etapa ${n}` },
            })
          ).id,
        )
    }
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Tipo ${marker}` },
    })
    tipos.push(tipo.id)
    const p = await prisma.produtos.create({
      data: {
        nome: "Produto",
        codigo: marker,
        id_tipo_produto: tipo.id,
        unidade: "UN",
        permite_producao: true,
      },
    })
    produtos.push(p.id)
    await prisma.produto_empresa.create({
      data: { id_produto: p.id, id_empresa: empresas[0] },
    })
    const grant = async (recurso, flags = {}, vinculo = vinculos[0]) =>
      prisma.permissoes_usuario.upsert({
        where: {
          id_usuario_empresa_recurso: { id_usuario_empresa: vinculo, recurso },
        },
        create: { id_usuario_empresa: vinculo, recurso, ...flags },
        update: {
          pode_ler: false,
          pode_criar: false,
          pode_editar: false,
          pode_excluir: false,
          ...flags,
        },
      })
    const revoke = () =>
      prisma.permissoes_usuario.deleteMany({
        where: { id_usuario_empresa: vinculos[0] },
      })
    const tokens = usuarios.map((id) =>
      signAccessToken({ id, role: "ADMINISTRACAO" }),
    )
    let httpAnunciado = false
    // O banco permanece igual entre cenários; os contadores são isolados.
    t.beforeEach(async () => {
      if (modoHttp) {
        if (server && server.exitCode === null)
          await new Promise((resolve) => {
            server.once("exit", resolve)
            server.kill()
          })
        ;({ server, base } = await httpProducao())
        if (!httpAnunciado) {
          console.log("Modo HTTP real: Next compilado em NODE_ENV=production.")
          httpAnunciado = true
        }
      } else resetRateLimitsForTests()
    })
    const routes = (path) => {
      const a =
        /^\/api\/ordens-producao\/(\d+)\/apontamentos(?:\/(\d+)\/(corrigir|estornar))?$/.exec(
          path,
        )
      if (a)
        return [
          `ordens-producao/[id]/apontamentos${a[2] ? `/[idApontamento]/${a[3]}` : ""}`,
          { id: a[1], idApontamento: a[2] },
        ]
      const c = /^\/api\/clientes\/(\d+)\/pedidos$/.exec(path)
      if (c) return ["clientes/[id]/pedidos", { id: c[1] }]
      return [path.slice(5), {}]
    }
    async function call(
      path,
      {
        method = "GET",
        body,
        key,
        user = 0,
        empresa = empresas[0],
        token = tokens[user],
      } = {},
    ) {
      const headers = {
        Authorization: `Bearer ${token}`,
        "X-Empresa-Id": String(empresa),
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      }
      const options = {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }
      let response
      if (modoHttp) {
        assert.ok(
          base,
          "O servidor HTTP precisa estar iniciado; não há fallback para handlers.",
        )
        response = await fetch(base + path, options)
      } else {
        const [route, params] = routes(path.split("?")[0])
        const mod = await import(`../src/app/api/${route}/route.ts`)
        response = await mod[method](
          new Request("http://localhost" + path, options),
          { params: Promise.resolve(params) },
        )
      }
      const text = await response.text()
      return { status: response.status, body: text ? JSON.parse(text) : null }
    }
    let seq = 0
    async function ordem(quantidade = "10", produto = p.id) {
      const o = await prisma.ordem_producao.create({
        data: {
          id_empresa: empresas[0],
          id_usuario: usuarios[0],
          numero: `${marker}-${++seq}`,
          status: "EM_PRODUCAO",
          quantidade_planejada: quantidade,
          ordem_producao_item: {
            create: { id_produto: produto, tamanho: "UNICO", quantidade },
          },
          ordem_producao_fluxo_setor: {
            create: setores.slice(0, 3).map((id_setor, i) => ({
              id_setor,
              ordem: i + 1,
              status: "EM_PRODUCAO",
              data_inicio: new Date(Date.now() - 86400000),
            })),
          },
        },
        include: {
          ordem_producao_item: true,
          ordem_producao_fluxo_setor: { orderBy: { ordem: "asc" } },
        },
      })
      return {
        id: o.id,
        item: o.ordem_producao_item[0].id,
        etapas: o.ordem_producao_fluxo_setor.map((e) => e.id),
      }
    }
    const registro = (o, produzida = "8", perdida = "2", etapa = 0) => ({
      idEtapa: o.etapas[etapa],
      idItem: o.item,
      quantidadeProduzida: produzida,
      quantidadePerdida: perdida,
      motivoPerda: perdida === "0" ? null : "Corte irregular",
      dataApontamento: diaOperacional(new Date()),
    })
    const post = (o, body, key = randomUUID()) =>
      call(`/api/ordens-producao/${o.id}/apontamentos`, {
        method: "POST",
        body,
        key,
      })
    const corrigir = (o, id, body, key = randomUUID()) =>
      call(`/api/ordens-producao/${o.id}/apontamentos/${id}/corrigir`, {
        method: "POST",
        body,
        key,
      })
    const estornar = (o, id, key = randomUUID()) =>
      call(`/api/ordens-producao/${o.id}/apontamentos/${id}/estornar`, {
        method: "POST",
        body: { motivo: "Registro incorreto" },
        key,
      })
    const contagens = async () =>
      Promise.all([
        prisma.estoque.count(),
        prisma.movimentacao_estoque.count(),
        prisma.kardex.count(),
        prisma.reserva_estoque.count(),
      ])
    const estoqueAntes = await contagens()

    await t.test(
      "18 recursos, quatro flags, sem concessão automática, ativos e isolamento",
      async () => {
        assert.equal(
          await prisma.permissoes_usuario.count({
            where: { id_usuario_empresa: { in: vinculos } },
          }),
          0,
        )
        for (const recurso of RECURSOS_PERMISSAO) {
          for (const flag of [
            "pode_ler",
            "pode_criar",
            "pode_editar",
            "pode_excluir",
          ]) {
            await grant(recurso)
            assert.deepEqual(
              await allowedCompanies(usuarios[0], recurso, flag),
              [],
            )
            await grant(recurso, { [flag]: true })
            assert.deepEqual(
              await allowedCompanies(usuarios[0], recurso, flag),
              [empresas[0]],
            )
            for (const outra of [
              "pode_ler",
              "pode_criar",
              "pode_editar",
              "pode_excluir",
            ].filter((f) => f !== flag))
              assert.deepEqual(
                await allowedCompanies(usuarios[0], recurso, outra),
                [],
              )
            assert.deepEqual(
              await allowedCompanies(usuarios[1], recurso, flag),
              [],
            )
          }
        }
        await grant("PRODUTOS", { pode_ler: true })
        for (const [model, id, data, restaurar] of [
          [
            "usuario_empresa",
            vinculos[0],
            { status: "INATIVO" },
            { status: "ATIVO" },
          ],
          ["usuarios", usuarios[0], { status: "INATIVO" }, { status: "ATIVO" }],
          ["empresas", empresas[0], { status: "INATIVA" }, { status: "ATIVA" }],
        ]) {
          await prisma[model].update({ where: { id }, data })
          assert.deepEqual(
            await allowedCompanies(usuarios[0], "PRODUTOS", "pode_ler"),
            [],
          )
          await prisma[model].update({ where: { id }, data: restaurar })
        }
        await revoke()
      },
    )
    await t.test(
      "cada recurso novo protege entrada real, sem herdar ESTOQUE/PRODUTOS",
      async () => {
        for (const [recurso, path] of [
          ["COMPRAS", "/api/compras/compras"],
          ["FORNECEDORES", "/api/fornecedores"],
          ["SETORES", "/api/setores"],
          ["FLUXOS_PRODUCAO", "/api/fluxos-producao"],
          ["TAMANHOS", "/api/tamanhos"],
          ["TIPOS_PRODUTO", "/api/tipos_produto"],
        ]) {
          await revoke()
          await grant("ESTOQUE", { pode_ler: true })
          await grant("PRODUTOS", { pode_ler: true })
          assert.equal((await call(path)).status, 403, recurso)
          await grant(recurso, { pode_editar: true })
          assert.equal((await call(path)).status, 403, recurso + " flag errada")
          await grant(recurso, { pode_ler: true })
          assert.equal((await call(path)).status, 200, recurso)
          assert.equal((await call(path, { empresa: empresas[1] })).status, 403)
          assert.equal((await call(path, { token: "invalid" })).status, 401)
        }
        await revoke()
        const cliente = await prisma.clientes.create({
          data: {
            id_empresa: empresas[0],
            nome_razao_social: "Cliente",
            cpf_cnpj: "52998224725",
            tipo_pessoa: "FISICA",
          },
        })
        const path = `/api/clientes/${cliente.id}/pedidos`
        await grant("CLIENTES", { pode_ler: true })
        await grant("PEDIDOS", { pode_ler: true })
        assert.equal((await call(path)).status, 403)
        await grant("VENDAS", { pode_ler: true })
        assert.equal((await call(path)).status, 200)
        await prisma.clientes.delete({ where: { id: cliente.id } })
        for (const [dominio, relatorio] of [
          [false, false],
          [true, false],
          [false, true],
          [true, true],
        ]) {
          await grant("ESTOQUE", { pode_ler: dominio })
          await grant("RELATORIOS", { pode_ler: relatorio })
          assert.equal(
            (await call("/api/relatorios/estoque/produtos")).status,
            dominio && relatorio ? 200 : 403,
          )
        }
      },
    )
    await revoke()
    await grant("ORDENS_PRODUCAO", { pode_ler: true, pode_editar: true })
    const o = await ordem()
    let primeiro
    await t.test(
      "registro persistente, Decimal, autoria, replay binário e auditoria atômica",
      async () => {
        const body = registro(o),
          key = randomUUID()
        const r = await post(o, body, key)
        assert.equal(r.status, 201, JSON.stringify(r.body))
        primeiro = r.body.apontamento.id
        assert.equal(r.body.apontamento.quantidade_produzida, "8.000")
        assert.equal(r.body.apontamento.id_usuario, usuarios[0])
        assert.equal((await post(o, body, key)).status, 200)
        assert.equal(
          (await post(o, { ...body, quantidadeProduzida: "7" }, key)).status,
          409,
        )
        assert.equal(
          await prisma.ordem_producao_apontamento.count({
            where: { id_ordem_producao: o.id },
          }),
          1,
        )
        assert.equal(
          await prisma.auditoria.count({
            where: {
              tabela: "producao_apontamento_evento",
              id_registro: r.body.evento.id,
              id_empresa: empresas[0],
            },
          }),
          1,
        )
        assert.equal(
          (
            await call(`/api/ordens-producao/${o.id}/apontamentos`, {
              empresa: empresas[1],
            })
          ).status,
          403,
        )
        assert.equal(
          (await call(`/api/ordens-producao/${o.id}/apontamentos`, { user: 1 }))
            .status,
          403,
        )
        await grant("ORDENS_PRODUCAO", { pode_ler: true })
        assert.equal(
          (await post(o, body, key)).status,
          403,
          "Replay também exige autorização atual",
        )
        await grant("ORDENS_PRODUCAO", { pode_ler: true, pode_editar: true })
        const cargo = await prisma.cargos.findFirstOrThrow({
          where: { id_empresa: empresas[0] },
        })
        const outro = await prisma.usuario_empresa.create({
          data: {
            id_usuario: usuarios[1],
            id_empresa: empresas[0],
            id_cargo: cargo.id,
          },
        })
        vinculos.push(outro.id)
        await grant("ORDENS_PRODUCAO", { pode_editar: true }, outro.id)
        assert.equal(
          (
            await call(`/api/ordens-producao/${o.id}/apontamentos`, {
              method: "POST",
              body,
              key,
              user: 1,
            })
          ).status,
          409,
          "Não pode assumir autoria",
        )
        await prisma.usuario_empresa.update({
          where: { id: outro.id },
          data: { status: "INATIVO" },
        })
        assert.equal(
          (
            await call(`/api/ordens-producao/${o.id}/apontamentos`, {
              method: "POST",
              body,
              key,
              user: 1,
            })
          ).status,
          403,
        )
        await prisma.permissoes_usuario.deleteMany({
          where: { id_usuario_empresa: outro.id },
        })
        await prisma.usuario_empresa.delete({ where: { id: outro.id } })
      },
    )
    await t.test(
      "limite e totais são por item, sem usar a meta do cabeçalho como saldo comum",
      async () => {
        const multi = await ordem("10")
        const second = await prisma.ordem_producao_item.create({
          data: {
            id_ordem_producao: multi.id,
            id_produto: p.id,
            tamanho: "M",
            quantidade: "2",
          },
        })
        assert.equal((await post(multi, registro(multi, "9", "1"))).status, 201)
        assert.equal(
          (
            await post(multi, {
              ...registro(multi, "3", "0"),
              idItem: second.id,
            })
          ).status,
          409,
        )
        assert.equal(
          (
            await post(multi, {
              ...registro(multi, "2", "0"),
              idItem: second.id,
            })
          ).status,
          201,
        )
        const h = await call(`/api/ordens-producao/${multi.id}/apontamentos`)
        assert.equal(h.status, 200)
        assert.equal(h.body.totais.length, 2)
        assert.equal(
          h.body.totais.find((item) => item.idItem === second.id).planejada,
          "2.000",
        )
        assert.equal(
          h.body.totais.find((item) => item.idItem === multi.item)
            .disponibilidade[1].disponivel,
          "9.000",
        )
      },
    )
    await t.test("validações HTTP, item/etapa/empresa e datas", async () => {
      const outra = await ordem()
      for (const patch of [
        { idItem: outra.item },
        { idEtapa: outra.etapas[0] },
      ])
        assert.equal((await post(o, { ...registro(o), ...patch })).status, 404)
      for (const patch of [
        { idUsuario: usuarios[1] },
        { idEmpresa: empresas[1] },
        { quantidadeProduzida: "-1" },
        { quantidadeProduzida: "1.0001" },
        { quantidadeProduzida: "1000000000000" },
        { quantidadeProduzida: "0", quantidadePerdida: "0", motivoPerda: null },
        { motivoPerda: null },
        { motivoPerda: "  " },
        { motivoPerda: "x".repeat(256) },
        { quantidadePerdida: "0", motivoPerda: "indevido" },
        { dataApontamento: "2026-02-30" },
      ])
        assert.equal(
          (await post(outra, { ...registro(outra), ...patch })).status,
          400,
          JSON.stringify(patch),
        )
      for (const dataApontamento of ["2000-01-01", "2999-01-01"])
        assert.equal(
          (await post(outra, { ...registro(outra), dataApontamento })).status,
          409,
        )
      assert.equal((await post(outra, registro(outra), "curta")).status, 400)
      await prisma.ordem_producao.update({
        where: { id: outra.id },
        data: { status: "CANCELADA" },
      })
      assert.equal((await post(outra, registro(outra))).status, 409)
    })
    await t.test(
      "limites entre etapas, correção e estorno preservam original e revalidam sucessoras",
      async () => {
        assert.equal(
          (await post(o, registro(o, "1", "0", 2))).status,
          409,
          "Etapa intermediária vazia não restaura planejado",
        )
        const segunda = await post(o, registro(o, "8", "0", 1))
        assert.equal(segunda.status, 201)
        const { idEtapa, idItem, ...valores } = registro(o, "7", "3")
        assert.ok(idEtapa && idItem)
        assert.equal(
          (
            await corrigir(o, primeiro, {
              ...valores,
              motivoCorrecao: "Conferência",
            })
          ).status,
          409,
        )
        assert.equal((await estornar(o, primeiro)).status, 409)
        const key = randomUUID(),
          correcao = {
            ...valores,
            quantidadeProduzida: "9",
            quantidadePerdida: "1",
            motivoCorrecao: "Recontagem",
          }
        const r = await corrigir(o, primeiro, correcao, key)
        assert.equal(r.status, 201, JSON.stringify(r.body))
        assert.equal((await corrigir(o, primeiro, correcao, key)).status, 200)
        assert.equal((await corrigir(o, primeiro, correcao)).status, 409)
        assert.equal(
          (
            await prisma.ordem_producao_apontamento.findUniqueOrThrow({
              where: { id: primeiro },
            })
          ).quantidade_produzida.toFixed(3),
          "8.000",
        )
        assert.equal(
          (await estornar(o, segunda.body.apontamento.id)).status,
          201,
        )
        const reversao = randomUUID()
        assert.equal(
          (await estornar(o, r.body.apontamento.id, reversao)).status,
          201,
        )
        assert.equal(
          (await estornar(o, r.body.apontamento.id, reversao)).status,
          200,
        )
        const history = await call(`/api/ordens-producao/${o.id}/apontamentos`)
        assert.equal(history.status, 200)
        assert.equal(history.body.rows.filter((a) => a.valido).length, 0)
        assert.ok(
          history.body.eventos.some(
            (e) =>
              e.tipo === "CORRECAO" && e.id_apontamento_anterior === primeiro,
          ),
        )
        assert.equal(history.body.totais[0].unidade, "UN")
        assert.equal(
          history.body.totais[0].disponibilidade[1].disponivel,
          "0.000",
        )
        assert.equal(
          (
            await call(
              `/api/ordens-producao/${o.id}/apontamentos?page=1&limit=1`,
            )
          ).body.rows.length,
          1,
        )
        assert.equal(
          (
            await call(
              `/api/ordens-producao/${o.id}/apontamentos?page=1&page=2`,
            )
          ).status,
          400,
        )
      },
    )
    await t.test(
      "perda total e legado não ressuscitam peças nem duplicam perdas",
      async () => {
        const total = await ordem()
        assert.equal(
          (await post(total, registro(total, "0", "10"))).status,
          201,
        )
        assert.equal(
          (await post(total, registro(total, "1", "0", 1))).status,
          409,
        )
        const legado = await ordem()
        await prisma.ordem_producao_apontamento.create({
          data: {
            id_ordem_producao: legado.id,
            id_ordem_producao_item: legado.item,
            id_setor: setores[0],
            id_usuario: usuarios[0],
            quantidade_produzida: "8",
            quantidade_perdida: "2",
            motivo_perda: "Legado",
            data_apontamento: new Date(),
          },
        })
        assert.equal(
          (await post(legado, registro(legado, "1", "0", 2))).status,
          409,
        )
        assert.equal(
          (await post(legado, registro(legado, "8", "0", 1))).status,
          201,
        )
        assert.equal(
          (await post(legado, registro(legado, "8", "0", 2))).status,
          201,
        )
        const h = await call(`/api/ordens-producao/${legado.id}/apontamentos`)
        assert.equal(h.body.totais[0].disponibilidade[2].disponivel, "8.000")
        const inconsistente = await ordem(),
          pontos = []
        for (const [i, quantidade] of [
          [1, "5"],
          [2, "6"],
        ])
          pontos.push(
            await prisma.ordem_producao_apontamento.create({
              data: {
                id_ordem_producao: inconsistente.id,
                id_ordem_producao_item: inconsistente.item,
                id_setor: setores[i],
                id_usuario: usuarios[0],
                quantidade_produzida: quantidade,
                data_apontamento: new Date(),
              },
            }),
          )
        assert.match(
          (await call(`/api/ordens-producao/${inconsistente.id}/apontamentos`))
            .body.totais[0].pendencia,
          /excede/,
        )
        assert.equal(
          (await estornar(inconsistente, pontos[0].id)).status,
          409,
          "Não aumenta inconsistência da sucessora",
        )
        assert.equal(
          (await estornar(inconsistente, pontos[1].id)).status,
          201,
          "Reduz inconsistência existente",
        )
        assert.equal((await estornar(inconsistente, pontos[0].id)).status, 201)
        assert.equal(
          (await post(inconsistente, registro(inconsistente))).status,
          201,
        )
      },
    )
    await t.test(
      "concorrência: saldo acumulado, mesma chave e correções incompatíveis",
      async () => {
        const c = await ordem(),
          body = registro(c, "7", "0")
        assert.deepEqual(
          (await Promise.all([post(c, body), post(c, body)]))
            .map((r) => r.status)
            .sort(),
          [201, 409],
        )
        const same = await ordem(),
          key = randomUUID()
        const replay = await Promise.all([
          post(same, registro(same), key),
          post(same, registro(same), key),
        ])
        assert.deepEqual(replay.map((r) => r.status).sort(), [200, 201])
        assert.equal(
          replay[0].body.apontamento.id,
          replay[1].body.apontamento.id,
        )
        const alvo = replay[0].body.apontamento.id
        const { idEtapa, idItem, ...v } = registro(same, "7", "2")
        assert.ok(idEtapa && idItem)
        assert.deepEqual(
          (
            await Promise.all([
              corrigir(same, alvo, { ...v, motivoCorrecao: "A" }),
              corrigir(same, alvo, { ...v, motivoCorrecao: "B" }),
            ])
          )
            .map((r) => r.status)
            .sort(),
          [201, 409],
        )
        const binary = await ordem(),
          k = "CaseSensitiveKey01"
        assert.equal(
          (await post(binary, registro(binary, "1", "0"), k)).status,
          201,
        )
        assert.equal(
          (await post(binary, registro(binary, "1", "0"), k.toLowerCase()))
            .status,
          201,
        )
      },
    )
    await t.test(
      "constraints reais de quantidade, motivo e FKs compostas",
      async () => {
        const a = await ordem(),
          b = await ordem()
        const raw = {
          id_ordem_producao: a.id,
          id_ordem_producao_item: a.item,
          id_setor: setores[0],
          id_usuario: usuarios[0],
          quantidade_produzida: "1",
          quantidade_perdida: "0",
          motivo_perda: null,
          data_apontamento: new Date(),
        }
        for (const patch of [
          { quantidade_produzida: "-1" },
          { quantidade_produzida: "0" },
          { motivo_perda: "indevido" },
          { quantidade_perdida: "1", motivo_perda: null },
          { quantidade_perdida: "1", motivo_perda: " " },
        ])
          await assert.rejects(
            prisma.ordem_producao_apontamento.create({
              data: { ...raw, ...patch },
            }),
          )
        for (const patch of [
          { id_ordem_producao_item: b.item },
          { id_setor: setores[3] },
        ])
          await assert.rejects(
            prisma.ordem_producao_apontamento.create({
              data: { ...raw, ...patch },
            }),
            (e) => e.code === "P2003",
          )
        const original = await prisma.ordem_producao_apontamento.create({
          data: raw,
        })
        const data = {
          id_empresa: empresas[0],
          id_ordem_producao: a.id,
          id_etapa: a.etapas[0],
          id_ordem_producao_item: a.item,
          id_setor: setores[0],
          id_usuario: usuarios[0],
          tipo: "ESTORNO",
          id_apontamento_anterior: original.id,
          motivo: "Teste",
          hash_requisicao: "a".repeat(64),
        }
        for (const patch of [
          { id_empresa: empresas[1] },
          { id_etapa: b.etapas[0] },
          { id_ordem_producao_item: b.item },
          { id_usuario: usuarios[1] },
          { id_setor: setores[1] },
        ])
          await assert.rejects(
            prisma.producao_apontamento_evento.create({
              data: { ...data, ...patch, chave_idempotencia: randomUUID() },
            }),
            (e) => e.code === "P2003",
          )
        await assert.rejects(
          prisma.producao_apontamento_evento.create({
            data: { ...data, motivo: " ", chave_idempotencia: randomUUID() },
          }),
        )
        const ddl = await connection.query(
          "SHOW CREATE TABLE producao_apontamento_evento",
        )
        assert.match(ddl[0]["Create Table"], /ascii_bin/)
        assert.match(ddl[0]["Create Table"], /chk_apontamento_evento_tipo/)
      },
    )
    await t.test(
      "falha na auditoria reverte apontamento e evento",
      async () => {
        const a = await ordem(),
          key = randomUUID()
        trigger = `test_auditoria_${marker}`
        await connection.query(
          `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON auditoria FOR EACH ROW BEGIN IF NEW.id_empresa = ${empresas[0]} AND NEW.tabela = 'producao_apontamento_evento' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha controlada de auditoria local'; END IF; END`,
        )
        try {
          assert.equal((await post(a, registro(a), key)).status, 500)
          assert.equal(
            await prisma.ordem_producao_apontamento.count({
              where: { id_ordem_producao: a.id },
            }),
            0,
          )
          assert.equal(
            await prisma.producao_apontamento_evento.count({
              where: { id_empresa: empresas[0], chave_idempotencia: key },
            }),
            0,
          )
        } finally {
          await connection.query(`DROP TRIGGER \`${trigger}\``)
          trigger = null
        }
        assert.equal((await post(a, registro(a), key)).status, 201)
      },
    )
    await t.test(
      "unidade histórica protegida; estoque e quantidade final não são alterados",
      async () => {
        const { updateProduto } = await import("../modules/produtos/service.ts")
        await assert.rejects(
          updateProduto(String(p.id), { unidade: "M" }, [empresas[0]]),
          (e) => e.status === 409,
        )
        assert.equal(
          (await prisma.produtos.findUniqueOrThrow({ where: { id: p.id } }))
            .unidade,
          "UN",
        )
        assert.deepEqual(await contagens(), estoqueAntes)
        assert.equal(
          await prisma.ordem_producao_item.count({
            where: {
              ordem_producao: { id_empresa: empresas[0] },
              quantidade_produzida: { not: "0" },
            },
          }),
          0,
        )
        const api = await call(`/api/ordens-producao/${o.id}/apontamentos`)
        assert.equal(api.status, 200)
        assert.equal(api.body.totais[0].planejada, "10.000")
        const novo = await prisma.produtos.create({
          data: {
            nome: "Concorrência unidade",
            codigo: marker + "-un",
            id_tipo_produto: tipo.id,
            unidade: "UN",
            permite_producao: true,
          },
        })
        produtos.push(novo.id)
        await prisma.produto_empresa.create({
          data: { id_produto: novo.id, id_empresa: empresas[0] },
        })
        const concorrente = await ordem("10", novo.id)
        const resultados = await Promise.allSettled([
          updateProduto(String(novo.id), { unidade: "M" }, [empresas[0]]),
          post(concorrente, registro(concorrente, "1", "0")),
        ])
        assert.equal(resultados[1].status, "fulfilled")
        assert.equal(resultados[1].value.status, 201)
        if (resultados[0].status === "rejected")
          assert.equal(resultados[0].reason.status, 409)
        const unidade = (
          await prisma.produtos.findUniqueOrThrow({ where: { id: novo.id } })
        ).unidade
        await assert.rejects(
          updateProduto(
            String(novo.id),
            { unidade: unidade === "M" ? "UN" : "M" },
            [empresas[0]],
          ),
          (e) => e.status === 409,
        )
      },
    )
  } finally {
    server?.kill()
    try {
      if (trigger)
        await connection.query(`DROP TRIGGER IF EXISTS \`${trigger}\``)
      await prisma.producao_apontamento_evento.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.ordem_producao_apontamento.deleteMany({
        where: {
          ordem_producao_item: {
            ordem_producao: { id_empresa: { in: empresas } },
          },
        },
      })
      await prisma.ordem_producao.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.auditoria.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.clientes.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.produto_empresa.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.permissoes_usuario.deleteMany({
        where: { id_usuario_empresa: { in: vinculos } },
      })
      await prisma.usuario_empresa.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.setores.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.cargos.deleteMany({
        where: { id_empresa: { in: empresas } },
      })
      await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
      await prisma.tipos_produto.deleteMany({ where: { id: { in: tipos } } })
      await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
    } finally {
      await connection.end()
      await prisma.$disconnect()
      hooks.deregister()
    }
  }
})
