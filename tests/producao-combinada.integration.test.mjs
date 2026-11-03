import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import mariadb from "mariadb"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"

// Sem fallback para banco remoto, handlers diretos, mocks ou assinatura manual de JWT.
const url = bancoLocal(process.env.PERMISSOES_PERDAS_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = "combinadas-local-" + randomUUID()
delete process.env.DEV_ID_USUARIO
delete process.env.DEV_ID_EMPRESA
const hooks = typescript()
const { prisma } = await import("../src/lib/prisma.ts")
const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
const { diaOperacional } =
  await import("../src/modules/apontamentos/apontamentos.regras.ts")
const log = []
const db = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
})
let server, base

async function fixture(numeroEtapas = 1) {
  const marker = randomUUID().slice(0, 8)
  const empresa = await prisma.empresas.create({
    data: {
      razao_social: `Combinadas ${marker}`,
      cnpj: `${Date.now()}${Math.floor(Math.random() * 10)}`,
    },
  })
  const cargo = await prisma.cargos.create({
    data: { id_empresa: empresa.id, nome: "Produção" },
  })
  const senha = "Local#Combinadas2026"
  const usuario = await prisma.usuarios.create({
    data: {
      nome: "HTTP local",
      email: `${marker}@combinadas.example.test`,
      senha: await hashPassword(senha),
    },
  })
  const vinculo = await prisma.usuario_empresa.create({
    data: {
      id_usuario: usuario.id,
      id_empresa: empresa.id,
      id_cargo: cargo.id,
    },
  })
  await prisma.permissoes_usuario.create({
    data: {
      id_usuario_empresa: vinculo.id,
      recurso: "ORDENS_PRODUCAO",
      pode_ler: true,
      pode_criar: true,
      pode_editar: true,
    },
  })
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: usuario.email, password: senha }),
  })
  assert.equal(login.status, 200)
  const token = (await login.json()).accessToken
  assert.ok(token)
  const f = {
    empresa: empresa.id,
    usuario: usuario.id,
    vinculo: vinculo.id,
    token,
  }
  const tipo = await prisma.tipos_produto.create({
    data: { nome: `Combinadas ${marker}` },
  })
  const produto = await prisma.produtos.create({
    data: {
      nome: "Produto local",
      codigo: marker,
      id_tipo_produto: tipo.id,
      unidade: "UN",
      permite_producao: true,
    },
  })
  const material = await prisma.produtos.create({
    data: {
      nome: "Material local",
      codigo: marker + "M",
      id_tipo_produto: tipo.id,
      unidade: "UN",
      permite_producao: false,
    },
  })
  for (const p of [produto, material])
    await prisma.produto_empresa.create({
      data: { id_empresa: f.empresa, id_produto: p.id },
    })
  await prisma.ficha_tecnica.create({
    data: {
      id_empresa: f.empresa,
      id_produto: produto.id,
      status: "ATIVA",
      ficha_tecnica_item: {
        create: {
          id_produto_componente: material.id,
          quantidade: "0.125",
          perda_percentual: "0",
        },
      },
    },
  })
  const setores = []
  for (let i = 0; i < numeroEtapas; i++)
    setores.push(
      await prisma.setores.create({
        data: { id_empresa: f.empresa, nome: `Etapa ${i}` },
      }),
    )
  const fluxo = await prisma.fluxos_producao.create({
    data: {
      id_empresa: f.empresa,
      nome: "Fluxo local",
      fluxo_producao_setor: {
        create: setores.map((s, i) => ({ id_setor: s.id, ordem: i + 1 })),
      },
    },
  })
  await prisma.produto_fluxo.create({
    data: { id_empresa: f.empresa, id_produto: produto.id, id_fluxo: fluxo.id },
  })
  f.op = (
    await call(
      f,
      "/api/ordem_producao",
      "POST",
      { numero: marker, quantidade_planejada: "10" },
      201,
    )
  ).id
  f.item = (
    await call(
      f,
      `/api/ordem_producao/${f.op}/itens`,
      "POST",
      { id_produto: produto.id, quantidade: "10" },
      201,
    )
  ).id
  await call(f, `/api/ordem_producao/${f.op}/liberar`, "POST", undefined, 200)
  await call(f, `/api/ordem_producao/${f.op}/iniciar`, "POST", undefined, 200)
  f.etapas = await prisma.ordem_producao_fluxo_setor.findMany({
    where: { id_ordem_producao: f.op },
    orderBy: { ordem: "asc" },
  })
  return f
}
async function fixtureLegada() {
  const f = await fixture(2)
  // Reproduz os valores padrão da migração, preservando o início e a movimentação da OP.
  await prisma.ordem_producao_snapshot.delete({
    where: { id_ordem_producao: f.op },
  })
  await prisma.ordem_producao_fluxo_setor.updateMany({
    where: { id_ordem_producao: f.op },
    data: { status: "PENDENTE", data_inicio: null, data_conclusao: null },
  })
  return f
}
const avancarLegado = (f) =>
  call(f, `/api/ordens-producao/${f.op}/avancar`, "POST", {
    statusEsperado: "EM_PRODUCAO",
    setorEsperado: f.etapas[0].id_setor,
    statusDestino: "EM_PRODUCAO",
  })
const encerrarLegado = (f, esperado = 200) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/encerrar`,
    "POST",
    {
      statusEsperado: "EM_PRODUCAO",
      setorEsperado: f.etapas[1].id_setor,
    },
    esperado,
  )
async function call(
  f,
  path,
  method = "GET",
  body,
  expected = 200,
  key,
  extra = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${f.token}`,
      "X-Empresa-Id": String(f.empresa),
      "Content-Type": "application/json",
      ...(key === undefined ? {} : { "Idempotency-Key": key }),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  log.push({
    method,
    path,
    body,
    key,
    expected,
    status: response.status,
    result,
  })
  if (expected !== null)
    assert.equal(response.status, expected, JSON.stringify(result))
  return expected === null
    ? { status: response.status, body: result.data ?? result }
    : (result.data ?? result)
}
const dados = (f, qty, perda = "0", etapa = f.etapas.length - 1) => ({
  idEtapa: f.etapas[etapa].id,
  idItem: f.item,
  quantidadeProduzida: String(qty),
  quantidadePerdida: perda,
  motivoPerda: perda === "0" ? null : "Perda documentada",
  dataApontamento: diaOperacional(new Date()),
})
const apontar = (
  f,
  qty,
  key = randomUUID(),
  expected = 201,
  perda = "0",
  etapa,
) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/apontamentos`,
    "POST",
    dados(f, qty, perda, etapa),
    expected,
    key,
  )
const confirmar = (f, qty, esperada = "0", key, expected = 200) =>
  call(
    f,
    `/api/ordem_producao/${f.op}/itens/${f.item}/producao`,
    "PUT",
    {
      quantidade_produzida: String(qty),
      quantidade_esperada: String(esperada),
    },
    expected,
    key,
  )
const corrigir = (
  f,
  id,
  qty,
  key = randomUUID(),
  expected = 201,
  perda = "0",
) => {
  const body = dados(f, qty, perda)
  delete body.idEtapa
  delete body.idItem
  return call(
    f,
    `/api/ordens-producao/${f.op}/apontamentos/${id}/corrigir`,
    "POST",
    { ...body, motivoCorrecao: "Correção identificada" },
    expected,
    key,
  )
}
const estornar = (f, id, key = randomUUID(), expected = 201) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/apontamentos/${id}/estornar`,
    "POST",
    { motivo: "Estorno identificado" },
    expected,
    key,
  )
async function estado(f) {
  const item = await prisma.ordem_producao_item.findUniqueOrThrow({
    where: { id: f.item },
  })
  const pontos =
    await prisma.$queryRaw`SELECT a.id,a.id_setor,a.quantidade_produzida,a.quantidade_perdida,e.id AS substituicao FROM ordem_producao_apontamento a LEFT JOIN producao_apontamento_evento e ON e.id_apontamento_anterior=a.id WHERE a.id_ordem_producao=${f.op} ORDER BY a.id`
  const eventos = await prisma.producao_apontamento_evento.findMany({
    where: { id_ordem_producao: f.op },
    orderBy: { id: "asc" },
  })
  const confirmacoes = await prisma.producao_confirmacao.findMany({
    where: { id_ordem_producao: f.op },
    orderBy: { id: "asc" },
  })
  const auditoria = await prisma.auditoria.findMany({
    where: { id_empresa: f.empresa },
    orderBy: { id: "asc" },
  })
  return {
    item: item.quantidade_produzida.toFixed(3),
    pontos,
    eventos,
    confirmacoes,
    auditoria,
  }
}
async function total(f, qty, perda = "0") {
  const e = await estado(f)
  const ativos = e.pontos.filter(
    (p) => p.substituicao === null && p.id_setor === f.etapas.at(-1).id_setor,
  )
  const somar = (campo) =>
    ativos.reduce((s, p) => s + Math.round(Number(p[campo]) * 1000), 0)
  assert.equal(e.item, Number(qty).toFixed(3))
  assert.equal(somar("quantidade_produzida"), Math.round(Number(qty) * 1000))
  assert.equal(somar("quantidade_perdida"), Math.round(Number(perda) * 1000))
  assert.ok(
    e.auditoria.every(
      (a) => a.id_usuario === f.usuario && a.id_empresa === f.empresa,
    ),
  )
  const consulta = await call(f, `/api/ordens-producao/${f.op}/apontamentos`)
  const final = consulta.totais[0].etapas.find(
    (e) => e.idSetor === f.etapas.at(-1).id_setor,
  )
  if (final) assert.equal(final.produzida, Number(qty).toFixed(3))
  log.push({ op: f.op, esperado: { qty, perda }, persistido: e })
  return e
}
async function semEfeito(f, operation) {
  const before = await estado(f)
  await operation()
  assert.deepEqual(await estado(f), before)
}

try {
  ;({ server, base } = await httpProducao())
  await test("Duas APIs por HTTP real, login e MariaDB isolado", async (t) => {
    await t.test(
      "apontar 6 e confirmar 6: uma contribuição; replays e chave incompatível",
      async () => {
        const f = await fixture(),
          pk = randomUUID(),
          ck = randomUUID()
        await apontar(f, "6", pk)
        await total(f, "6")
        await confirmar(f, "6", "0", ck)
        await semEfeito(f, () => apontar(f, "6", pk, 200))
        await semEfeito(f, () => confirmar(f, "6", "0", ck))
        await semEfeito(f, () => confirmar(f, "7", "0", ck, 409))
        const e = await total(f, "6")
        assert.equal(e.pontos.length, 1)
        assert.equal(e.confirmacoes.length, 1)
      },
    )
    await t.test(
      "dois fatos independentes de 3 somam 6, sem deduplicar por quantidade",
      async () => {
        const f = await fixture()
        await apontar(f, "3")
        await apontar(f, "3")
        await confirmar(f, "6")
        assert.equal((await total(f, "6")).pontos.length, 2)
      },
    )
    await t.test(
      "três etapas com 6 peças não viram 18; perdas ficam separadas",
      async () => {
        const f = await fixture(3)
        let primeiro
        for (let i = 0; i < 2; i++) {
          const ponto = await apontar(
            f,
            "6",
            randomUUID(),
            201,
            i === 0 ? "2" : "0",
            i,
          )
          if (i === 0) primeiro = ponto.apontamento.id
          assert.equal((await estado(f)).item, "0.000")
          await call(
            f,
            `/api/ordem_producao/${f.op}/etapas/${f.etapas[i].id}/concluir`,
            "POST",
            undefined,
            200,
          )
          await call(
            f,
            `/api/ordem_producao/${f.op}/etapas/${f.etapas[i + 1].id}/iniciar`,
            "POST",
            undefined,
            200,
          )
        }
        await apontar(f, "6")
        await confirmar(f, "6")
        await total(f, "6")
        await semEfeito(f, () => apontar(f, "1", randomUUID(), 409))
        await semEfeito(f, () => corrigir(f, primeiro, "5", randomUUID(), 409))
      },
    )
    await t.test(
      "confirmação primeiro: registro detalhado sem vínculo é rejeitado sem efeitos",
      async () => {
        const f = await fixture()
        await confirmar(f, "6", "0", randomUUID())
        await total(f, "6")
        await semEfeito(f, () => apontar(f, "6", randomUUID(), 409))
        await total(f, "6")
      },
    )
    for (const depois of [false, true])
      await t.test(
        `correção ${depois ? "depois" : "antes"} da confirmação: 6 passa a 4, histórico e replay`,
        async () => {
          const f = await fixture(),
            p = await apontar(f, "6"),
            ck = randomUUID()
          if (depois) await confirmar(f, "6", "0", ck)
          const key = randomUUID(),
            c = await corrigir(f, p.apontamento.id, "4", key)
          await semEfeito(f, () => corrigir(f, p.apontamento.id, "4", key, 200))
          await semEfeito(f, () =>
            corrigir(f, p.apontamento.id, "5", randomUUID(), 409),
          )
          await semEfeito(f, () => confirmar(f, "6", "0", ck, 409))
          await confirmar(f, "4", "4", randomUUID())
          const e = await total(f, "4")
          assert.equal(e.pontos.length, 2)
          assert.ok(
            e.pontos.find((x) => x.id === p.apontamento.id).substituicao,
          )
          assert.equal(c.evento.id_apontamento_anterior, p.apontamento.id)
        },
      )
    for (const depois of [false, true])
      await t.test(
        `estorno ${depois ? "depois" : "antes"} da confirmação preserva outro fato e compensa uma vez`,
        async () => {
          const f = await fixture(),
            a = await apontar(f, "3"),
            b = await apontar(f, "3"),
            ck = randomUUID()
          if (depois) await confirmar(f, "6", "0", ck)
          const key = randomUUID()
          await estornar(f, a.apontamento.id, key)
          await semEfeito(f, () => estornar(f, a.apontamento.id, key, 200))
          await semEfeito(f, () =>
            estornar(f, a.apontamento.id, randomUUID(), 409),
          )
          await semEfeito(f, () => confirmar(f, "6", "0", ck, 409))
          await confirmar(f, "3", "3", randomUUID())
          const e = await total(f, "3")
          assert.equal(
            e.pontos.find((x) => x.id === b.apontamento.id).substituicao,
            null,
          )
        },
      )
    await t.test(
      "produção com perda: 6 boas e 2 perdidas; correção separada",
      async () => {
        const f = await fixture(),
          p = await apontar(f, "6", randomUUID(), 201, "2")
        await confirmar(f, "6")
        await total(f, "6", "2")
        await corrigir(f, p.apontamento.id, "4", randomUUID(), 201, "3")
        await total(f, "4", "3")
        await semEfeito(f, () => apontar(f, "0", randomUUID(), 400, "1.0000"))
        const invalid = { ...dados(f, "1", "1"), motivoPerda: null }
        await semEfeito(f, () =>
          call(
            f,
            `/api/ordens-producao/${f.op}/apontamentos`,
            "POST",
            invalid,
            400,
            randomUUID(),
          ),
        )
      },
    )
    await t.test(
      "ABA: confirmação antiga não recria delta estornado, inclusive cliente sem chave",
      async () => {
        const f = await fixture()
        await confirmar(f, "6", "0")
        await confirmar(f, "8", "6")
        const e = await total(f, "8"),
          segundo = e.confirmacoes.find((c) =>
            c.quantidade_produzida.eq(8),
          ).id_apontamento_novo
        await estornar(f, segundo)
        await total(f, "6")
        await semEfeito(f, () => confirmar(f, "8", "6", undefined, 409))
        await confirmar(f, "8", "6", randomUUID())
        await total(f, "8")
      },
    )
    await t.test(
      "duas APIs concorrentes contam as mesmas 6 peças uma vez",
      async () => {
        const f = await fixture()
        const results = await Promise.all([
          apontar(f, "6", randomUUID(), null),
          confirmar(f, "6", "0", randomUUID(), null),
        ])
        assert.ok(
          results.every((r) => [200, 201, 409].includes(r.status)),
          JSON.stringify(results),
        )
        assert.ok(results.some((r) => [200, 201].includes(r.status)))
        await total(f, "6")
      },
    )
    for (const reversao of [false, true])
      await t.test(
        `${reversao ? "estorno" : "correção"} concorrente com confirmação não restaura registro`,
        async () => {
          const f = await fixture(),
            p = await apontar(f, "6"),
            key = randomUUID(),
            ck = randomUUID()
          await confirmar(f, "6", "0", ck)
          const op = () =>
            reversao
              ? estornar(f, p.apontamento.id, key, null)
              : corrigir(f, p.apontamento.id, "4", key, null)
          const [adjustment, confirmation] = await Promise.all([
            op(),
            confirmar(f, "6", "0", ck, null),
          ])
          assert.ok([200, 201, 409].includes(adjustment.status))
          assert.ok([200, 409].includes(confirmation.status))
          if (adjustment.status === 409) assert.equal((await op()).status, 201)
          await total(f, reversao ? "0" : "4")
          await semEfeito(f, () => confirmar(f, "6", "0", ck, 409))
        },
      )
    await t.test(
      "duas correções incompatíveis: somente uma vence",
      async () => {
        const f = await fixture(),
          p = await apontar(f, "6")
        const r = await Promise.all([
          corrigir(f, p.apontamento.id, "4", randomUUID(), null),
          corrigir(f, p.apontamento.id, "5", randomUUID(), null),
        ])
        assert.deepEqual(r.map((x) => x.status).sort(), [201, 409])
        const e = await estado(f)
        assert.equal(e.eventos.length, 2)
        await total(f, e.item)
      },
    )
    await t.test(
      "falha real de auditoria reverte apontamento, evento, projeção e confirmação",
      async () => {
        const f = await fixture(),
          name = `pr120_falha_${f.empresa}`
        await db.query(
          `CREATE TRIGGER ${name} BEFORE INSERT ON auditoria FOR EACH ROW BEGIN IF NEW.id_empresa=${f.empresa} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='falha local intencional'; END IF; END`,
        )
        try {
          await semEfeito(f, () => apontar(f, "6", randomUUID(), 500))
          await semEfeito(f, () => confirmar(f, "6", "0", randomUUID(), 500))
        } finally {
          await db.query(`DROP TRIGGER ${name}`)
        }
        await apontar(f, "6")
        await confirmar(f, "6")
        await total(f, "6")
      },
    )
    await t.test(
      "autenticação, leitura sem edição, vínculo, escopo e corpo manipulados: zero gravações",
      async () => {
        const f = await fixture(),
          other = await fixture()
        const path = `/api/ordem_producao/${f.op}/itens/${f.item}/producao`,
          detailed = `/api/ordens-producao/${f.op}/apontamentos`,
          input = { quantidade_produzida: "6", quantidade_esperada: "0" }
        for (const [p, method, body] of [
          [path, "PUT", input],
          [detailed, "POST", dados(f, "6")],
        ]) {
          await semEfeito(f, () =>
            call(f, p, method, body, 401, randomUUID(), { Authorization: "" }),
          )
          await semEfeito(f, () =>
            call(f, p, method, body, 403, randomUUID(), {
              "X-Empresa-Id": String(other.empresa),
            }),
          )
          await semEfeito(f, () =>
            call(other, p, method, body, 404, randomUUID()),
          )
          await semEfeito(f, () =>
            call(
              f,
              p,
              method,
              { ...body, id_empresa: other.empresa, id_usuario: other.usuario },
              400,
              randomUUID(),
            ),
          )
        }
        await semEfeito(f, () =>
          call(
            f,
            `/api/ordens-producao/${f.op}/apontamentos`,
            "POST",
            { ...dados(f, "6"), idEtapa: other.etapas[0].id },
            404,
            randomUUID(),
          ),
        )
        await semEfeito(f, () =>
          call(
            f,
            `/api/ordens-producao/${f.op}/apontamentos`,
            "POST",
            { ...dados(f, "6"), idItem: other.item },
            404,
            randomUUID(),
          ),
        )
        await semEfeito(f, () =>
          call(
            f,
            `/api/ordem_producao/${f.op}/itens/${other.item}/producao`,
            "PUT",
            input,
            404,
            randomUUID(),
          ),
        )
        await prisma.permissoes_usuario.update({
          where: {
            id_usuario_empresa_recurso: {
              id_usuario_empresa: f.vinculo,
              recurso: "ORDENS_PRODUCAO",
            },
          },
          data: { pode_editar: false },
        })
        for (const [p, method, body] of [
          [path, "PUT", input],
          [detailed, "POST", dados(f, "6")],
        ])
          await semEfeito(f, () => call(f, p, method, body, 403, randomUUID()))
        await call(f, detailed, "GET", undefined, 200)
        await prisma.permissoes_usuario.update({
          where: {
            id_usuario_empresa_recurso: {
              id_usuario_empresa: f.vinculo,
              recurso: "ORDENS_PRODUCAO",
            },
          },
          data: { pode_ler: false },
        })
        await call(f, detailed, "GET", undefined, 403)
      },
    )
    await t.test(
      "conclusão bloqueia ajuste sem compensação; restrição de etapa posterior permanece",
      async () => {
        const f = await fixture()
        const p = await apontar(f, "6")
        await confirmar(f, "6")
        await call(
          f,
          `/api/ordem_producao/${f.op}/etapas/${f.etapas[0].id}/concluir`,
          "POST",
          undefined,
          200,
        )
        await semEfeito(f, () =>
          corrigir(f, p.apontamento.id, "4", randomUUID(), 409),
        )
        await semEfeito(f, () =>
          estornar(f, p.apontamento.id, randomUUID(), 409),
        )
        await total(f, "6")
      },
    )
    await t.test(
      "perdas na primeira etapa limitam confirmação final de OP sem snapshot",
      async () => {
        const f = await fixture(2)
        await apontar(f, "6", randomUUID(), 201, "4", 0)
        await call(
          f,
          `/api/ordem_producao/${f.op}/etapas/${f.etapas[0].id}/concluir`,
          "POST",
          undefined,
          200,
        )
        await call(
          f,
          `/api/ordem_producao/${f.op}/etapas/${f.etapas[1].id}/iniciar`,
          "POST",
          undefined,
          200,
        )
        await prisma.ordem_producao_snapshot.delete({
          where: { id_ordem_producao: f.op },
        })
        await semEfeito(f, () => confirmar(f, "10", "0", randomUUID(), 409))
        const chave = randomUUID()
        await confirmar(f, "6", "0", chave)
        await semEfeito(f, () => confirmar(f, "6", "0", chave))
        const e = await total(f, "6")
        assert.equal(e.confirmacoes.length, 1)
        assert.equal(e.pontos.length, 2)
      },
    )
    await t.test(
      "etapas legadas pendentes aceitam apontamento somente após a chegada comprovada",
      async () => {
        const f = await fixtureLegada()
        await semEfeito(f, () => apontar(f, "6", randomUUID(), 409))
        await apontar(f, "6", randomUUID(), 201, "4", 0)
        await avancarLegado(f)
        await apontar(f, "6")
        await total(f, "6")
        assert.equal((await encerrarLegado(f)).ordem.status, "CONCLUIDA")
      },
    )
    await t.test(
      "confirmação legada anterior impede apontamento que inviabiliza a produção final",
      async () => {
        const f = await fixtureLegada()
        await avancarLegado(f)
        await confirmar(f, "10", "0", randomUUID())
        await semEfeito(f, () => apontar(f, "6", randomUUID(), 409, "4", 0))
        const gravado = await estado(f)
        assert.equal(gravado.item, "10.000")
        assert.equal(gravado.pontos.length, 0)
        assert.equal(gravado.confirmacoes.length, 1)
        // Um registro retroativo compatível continua permitido.
        await apontar(f, "10", randomUUID(), 201, "0", 0)
        assert.equal((await encerrarLegado(f)).ordem.status, "CONCLUIDA")
      },
    )
    await t.test(
      "encerramento legado bloqueia saldo final já divergente do histórico",
      async () => {
        const f = await fixtureLegada()
        await avancarLegado(f)
        await confirmar(f, "10", "0", randomUUID())
        // Estado inconsistente que a revisão anterior podia deixar persistido.
        await prisma.ordem_producao_apontamento.create({
          data: {
            id_ordem_producao: f.op,
            id_ordem_producao_item: f.item,
            id_setor: f.etapas[0].id_setor,
            id_usuario: f.usuario,
            quantidade_produzida: "6",
            quantidade_perdida: "4",
            motivo_perda: "Perda documentada",
            data_apontamento: new Date(),
          },
        })
        await semEfeito(f, () => encerrarLegado(f, 409))
        const ordem = await prisma.ordem_producao.findUniqueOrThrow({
          where: { id: f.op },
        })
        assert.equal(ordem.status, "EM_PRODUCAO")
        assert.equal(ordem.data_conclusao, null)
      },
    )
    await t.test(
      "confirmação legada de 6 permite confirmar 8 quando a etapa anterior comprova 10",
      async () => {
        const f = await fixtureLegada()
        await avancarLegado(f)
        await confirmar(f, "6", "0", randomUUID())
        await apontar(f, "10", randomUUID(), 201, "0", 0)
        const chave = randomUUID()
        await confirmar(f, "8", "6", chave)
        await semEfeito(f, () => confirmar(f, "8", "6", chave))
        const e = await total(f, "8")
        assert.equal(e.confirmacoes.length, 2)
        assert.equal(e.pontos.length, 2)
        assert.equal((await encerrarLegado(f)).ordem.status, "CONCLUIDA")
      },
    )
    await t.test(
      "ajuste explícito preserva a confirmação anterior e permite apontar as perdas reais",
      async () => {
        const f = await fixtureLegada()
        await avancarLegado(f)
        await confirmar(f, "10", "0", randomUUID())
        await semEfeito(f, () => confirmar(f, "6", "10", randomUUID(), 409))
        const chave = randomUUID()
        const ajustar = () =>
          call(
            f,
            `/api/ordem_producao/${f.op}/itens/${f.item}/producao`,
            "PUT",
            {
              quantidade_produzida: "6",
              quantidade_esperada: "10",
              motivo_ajuste_legado:
                "Contagem física corrigida antes do fechamento",
            },
            200,
            chave,
          )
        await ajustar()
        await semEfeito(f, ajustar)
        await apontar(f, "6", randomUUID(), 201, "4", 0)
        await confirmar(f, "6", "6", randomUUID())
        const e = await total(f, "6")
        assert.equal(e.confirmacoes.length, 3)
        assert.equal(
          e.confirmacoes[0].quantidade_produzida.toFixed(3),
          "10.000",
        )
        assert.ok(
          e.auditoria.some((a) =>
            a.dados_novos?.includes("Contagem física corrigida"),
          ),
        )
        assert.equal((await encerrarLegado(f)).ordem.status, "CONCLUIDA")
      },
    )
    await t.test(
      "zero produzido só conclui com perda integral comprovada",
      async () => {
        const f = await fixture()
        const rota = `/api/ordem_producao/${f.op}/etapas/${f.etapas[0].id}/concluir`
        await semEfeito(f, () => call(f, rota, "POST", undefined, 409))
        await apontar(f, "0", randomUUID(), 201, "10", 0)
        const op = await call(f, rota, "POST")
        assert.equal(op.status, "CONCLUIDA")
        await total(f, "0", "10")
      },
    )
    await t.test(
      "saída de insumo não bloqueia o primeiro apontamento final",
      async () => {
        const f = await fixture()
        const material =
          await prisma.ordem_producao_consumo_planejado.findFirstOrThrow({
            where: { id_ordem_producao: f.op },
          })
        const saida = await prisma.movimentacao_estoque.create({
          data: {
            id_empresa: f.empresa,
            id_produto: material.id_materia_prima,
            id_usuario: f.usuario,
            tipo: "SAIDA_PRODUCAO",
            quantidade: "0.750",
            origem_tipo: "CONSUMO_PRODUCAO",
            origem_id: f.op,
          },
        })
        await apontar(f, "6")
        await confirmar(f, "6", "6", randomUUID())
        await total(f, "6")
        const concluida = await call(
          f,
          `/api/ordem_producao/${f.op}/etapas/${f.etapas[0].id}/concluir`,
          "POST",
        )
        assert.equal(concluida.status, "CONCLUIDA")
        assert.deepEqual(
          await prisma.movimentacao_estoque.findMany({
            where: { id_empresa: f.empresa, origem_id: f.op },
          }),
          [saida],
        )
      },
    )
    await t.test(
      "leitura de produtos permite o seletor sem liberar o catálogo de tipos",
      async () => {
        const f = await fixture()
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: f.vinculo,
            recurso: "PRODUTOS",
            pode_ler: true,
            pode_criar: true,
          },
        })
        await call(f, "/api/tipos_produto", "GET", undefined, 403)
        const tipos = await call(f, "/api/produtos/tipos")
        assert.ok(tipos.rows.length)
        assert.deepEqual(Object.keys(tipos.rows[0]).sort(), [
          "id",
          "nome",
          "status",
        ])
      },
    )
    await t.test(
      "OP sem snapshot também confirma os fatos detalhados e rejeita produção superada",
      async () => {
        const f = await fixture()
        // Fixture de estrutura legada, mantendo as etapas/início/histórico reais criados por HTTP.
        await prisma.ordem_producao_snapshot.delete({
          where: { id_ordem_producao: f.op },
        })
        const p = await apontar(f, "6"),
          key = randomUUID()
        await confirmar(f, "6", "0", key)
        await semEfeito(f, () => confirmar(f, "7", "6", randomUUID(), 409))
        await corrigir(f, p.apontamento.id, "4")
        await semEfeito(f, () => confirmar(f, "6", "0", key, 409))
        await confirmar(f, "4", "4", randomUUID())
        await total(f, "4")
      },
    )
    await t.test(
      "outro autor não reaproveita chave de confirmação, mesmo com edição explícita",
      async () => {
        const f = await fixture(),
          other = await fixture(),
          key = randomUUID()
        await apontar(f, "6")
        await confirmar(f, "6", "0", key)
        const vinculo = await prisma.usuario_empresa.findUniqueOrThrow({
          where: { id: f.vinculo },
        })
        const outro = await prisma.usuario_empresa.create({
          data: {
            id_empresa: f.empresa,
            id_usuario: other.usuario,
            id_cargo: vinculo.id_cargo,
          },
        })
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: outro.id,
            recurso: "ORDENS_PRODUCAO",
            pode_ler: true,
            pode_editar: true,
          },
        })
        await semEfeito(f, () =>
          confirmar({ ...f, token: other.token }, "6", "0", key, 409),
        )
        await total(f, "6")
      },
    )
    await t.test(
      "permissão revogada durante espera no lock é relida na mesma transação",
      async () => {
        const f = await fixture()
        const before = await estado(f)
        await db.beginTransaction()
        await db.query("SELECT id FROM empresas WHERE id=? FOR UPDATE", [
          f.empresa,
        ])
        let pending
        try {
          pending = confirmar(f, "6", "0", randomUUID(), null)
          // A rota pode autorizar antes da revogação, mas a transação deve revalidar.
          await new Promise((resolve) => setTimeout(resolve, 250))
          await db.query(
            "UPDATE permissoes_usuario SET pode_editar=0 WHERE id_usuario_empresa=? AND recurso=?",
            [f.vinculo, "ORDENS_PRODUCAO"],
          )
          await db.commit()
          const result = await pending
          assert.ok([403, 409].includes(result.status), JSON.stringify(result))
          if (result.status === 409)
            await confirmar(f, "6", "0", randomUUID(), 403)
        } catch (e) {
          await db.rollback()
          throw e
        }
        assert.deepEqual(await estado(f), before)
      },
    )
  })
} finally {
  server?.kill()
  if (process.env.PR120_HTTP_LOG)
    writeFileSync(
      process.env.PR120_HTTP_LOG,
      JSON.stringify(log, (_, v) => (typeof v === "bigint" ? String(v) : v), 2),
    )
  await db.end()
  await prisma.$disconnect()
  hooks.deregister()
}
