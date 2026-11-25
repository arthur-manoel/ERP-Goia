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
const url = bancoLocal(process.env.PRODUCAO_LOTES_TEST_DATABASE_URL)
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

async function fixture(numeroEtapas = 2, quantidade = "100", comGrade = false) {
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
      nivel_acesso: "EMPRESA",
    },
  })
  await prisma.permissoes_usuario.createMany({
    data: ["ORDENS_PRODUCAO", "ESTOQUE"].map((recurso) => ({
      id_usuario_empresa: vinculo.id,
      recurso,
      pode_ler: true,
      pode_criar: true,
      pode_editar: true,
    })),
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
  const local = await prisma.locais_estoque.create({
    data: { id_empresa: f.empresa, nome: "Local da produção" },
  })
  f.op = (
    await call(
      f,
      "/api/ordem_producao",
      "POST",
      {
        numero: marker,
        quantidade_planejada: quantidade,
        id_local_estoque: local.id,
      },
      201,
    )
  ).id
  let variacoes = []
  if (comGrade) {
    for (const nome of ["Azul", "Vermelho"]) {
      const cor = await prisma.cores.create({
        data: { id_empresa: f.empresa, nome },
      })
      variacoes.push(
        await prisma.produto_variacoes.create({
          data: {
            id_empresa: f.empresa,
            id_produto: produto.id,
            id_cor: cor.id,
          },
        }),
      )
    }
  }
  f.item = (
    await call(
      f,
      `/api/ordem_producao/${f.op}/itens`,
      "POST",
      {
        id_produto: produto.id,
        quantidade,
        ...(comGrade ? { id_variacao: variacoes[0].id } : {}),
      },
      201,
    )
  ).id
  if (comGrade)
    f.item2 = (
      await call(
        f,
        `/api/ordem_producao/${f.op}/itens`,
        "POST",
        { id_produto: produto.id, quantidade, id_variacao: variacoes[1].id },
        201,
      )
    ).id
  await call(f, `/api/ordem_producao/${f.op}/liberar`, "POST", undefined, 200)
  await call(
    f,
    "/api/estoque/entradas",
    "POST",
    {
      idProduto: material.id,
      idLocalEstoque: local.id,
      idSetor: setores[0].id,
      quantidade: new (
        await import("../src/generated/prisma/client.ts")
      ).Prisma.Decimal(quantidade)
        .mul(comGrade ? "0.250" : "0.125")
        .toFixed(3),
      observacao: "Saldo da fixture de produção",
    },
    201,
    randomUUID(),
  )
  const reserva = await call(
    f,
    "/api/estoque/reservas",
    "POST",
    {
      origem: "PRODUCAO",
      idOrigem: f.op,
      idProduto: material.id,
      idLocalEstoque: local.id,
      quantidade: new (
        await import("../src/generated/prisma/client.ts")
      ).Prisma.Decimal(quantidade)
        .mul(comGrade ? "0.250" : "0.125")
        .toFixed(3),
    },
    201,
    randomUUID(),
  )
  await call(f, `/api/ordem_producao/${f.op}/iniciar`, "POST", undefined, 200)
  await call(
    f,
    `/api/ordem_producao/${f.op}/consumos`,
    "POST",
    {
      idReserva: reserva.idReserva,
      quantidade: new (
        await import("../src/generated/prisma/client.ts")
      ).Prisma.Decimal(quantidade)
        .mul(comGrade ? "0.250" : "0.125")
        .toFixed(3),
      concluirConsumo: true,
    },
    201,
    randomUUID(),
  )
  f.etapas = await prisma.ordem_producao_fluxo_setor.findMany({
    where: { id_ordem_producao: f.op },
    orderBy: { ordem: "asc" },
  })
  return {
    ...f,
    email: usuario.email,
    senha,
    produto: produto.id,
    material: material.id,
    local: local.id,
    reserva: reserva.idReserva,
  }
}

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
      ...(key ? { "Idempotency-Key": key } : {}),
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  log.push({ method, path, expected, status: response.status, result })
  if (expected !== null)
    assert.equal(response.status, expected, JSON.stringify(result))
  return expected === null
    ? { status: response.status, body: result.data ?? result }
    : (result.data ?? result)
}
const linha = (f, q) => [{ idItem: f.item, quantidade: String(q) }]
const envio = (f, q, idx = 0, key = randomUUID(), expected = 201) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/movimentacoes`,
    "POST",
    {
      idEtapaOrigem: f.etapas[idx].id,
      idEtapaDestino: f.etapas[idx + 1].id,
      itens: linha(f, q),
    },
    expected,
    key,
  )
const receber = (f, m, q, key = randomUUID(), expected = 201) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/movimentacoes/${m}/receber`,
    "POST",
    { itens: linha(f, q) },
    expected,
    key,
  )
const posicoes = (f) => call(f, `/api/ordens-producao/${f.op}/movimentacoes`)
const apontar = (f, q, idx = 0, perda = "0", expected = 201) =>
  call(
    f,
    `/api/ordens-producao/${f.op}/apontamentos`,
    "POST",
    {
      idEtapa: f.etapas[idx].id,
      idItem: f.item,
      quantidadeProduzida: String(q),
      quantidadePerdida: perda,
      motivoPerda: perda === "0" ? null : "Perda comprovada",
      dataApontamento: diaOperacional(new Date()),
    },
    expected,
    randomUUID(),
  )
const concluir = (f, idx, expected = 200) =>
  call(
    f,
    `/api/ordem_producao/${f.op}/etapas/${f.etapas[idx].id}/concluir`,
    "POST",
    {},
    expected,
    randomUUID(),
  )
try {
  ;({ server, base } = await httpProducao())
  await test("Fracionamento 100 = 40 na origem + 40 em trânsito + 20 recebidas; consumo e entrada únicos", async () => {
    const f = await fixture()
    const antes = await prisma.movimentacao_estoque.count({
      where: { id_empresa: f.empresa },
    })
    await apontar(f, 100)
    const key = randomUUID(),
      m = await envio(f, 60, 0, key)
    assert.equal(
      (await envio(f, 60, 0, key, 200)).idMovimentacao,
      m.idMovimentacao,
    )
    let p = (await posicoes(f)).posicoes[0].etapas
    assert.deepEqual(
      [p[0].disponivelEnvio, p[0].emTransito, p[1].entrada],
      ["40.000", "60.000", "0.000"],
    )
    const rk = randomUUID()
    await receber(f, m.idMovimentacao, 20, rk)
    await receber(f, m.idMovimentacao, 20, rk, 200)
    p = (await posicoes(f)).posicoes[0].etapas
    assert.deepEqual(
      [p[0].noSetor, p[0].emTransito, p[1].entrada],
      ["40.000", "40.000", "20.000"],
    )
    await apontar(f, 21, 1, "0", 409)
    await apontar(f, 20, 1)
    await envio(f, 41, 0, randomUUID(), 409)
    await receber(f, m.idMovimentacao, 41, randomUUID(), 409)
    await concluir(f, 0, 409)
    await receber(f, m.idMovimentacao, 40)
    const restante = await envio(f, 40)
    await receber(f, restante.idMovimentacao, 40)
    await concluir(f, 0)
    await apontar(f, 80, 1)
    assert.equal(
      await prisma.movimentacao_estoque.count({
        where: { id_empresa: f.empresa },
      }),
      antes,
    )
    await concluir(f, 1)
    const total = await prisma.movimentacao_estoque.count({
      where: {
        id_empresa: f.empresa,
        origem_tipo: "ORDEM_PRODUCAO",
        origem_id: f.op,
        tipo: "ENTRADA_PRODUCAO",
      },
    })
    assert.equal(total, 1)
    await concluir(f, 1, 409)
    assert.equal(
      await prisma.consumo_producao.count({
        where: { id_ordem_producao: f.op },
      }),
      1,
    )
    assert.equal(
      await prisma.movimentacao_estoque.count({
        where: {
          id_empresa: f.empresa,
          origem_tipo: "ORDEM_PRODUCAO",
          origem_id: f.op,
          tipo: "ENTRADA_PRODUCAO",
        },
      }),
      1,
    )
  })
  await test("Disputas serializadas de envio e recebimento; chave incompatível e rollback", async () => {
    const f = await fixture()
    await apontar(f, 100)
    const sends = await Promise.all([
      envio(f, 60, 0, randomUUID(), null),
      envio(f, 60, 0, randomUUID(), null),
    ])
    assert.deepEqual(sends.map((r) => r.status).sort(), [201, 409])
    const m = sends.find((r) => r.status === 201).body.idMovimentacao
    const recs = await Promise.all([
      receber(f, m, 40, randomUUID(), null),
      receber(f, m, 40, randomUUID(), null),
    ])
    assert.deepEqual(recs.map((r) => r.status).sort(), [201, 409])
    const key = randomUUID()
    await receber(f, m, 10, key)
    await receber(f, m, 5, key, 409)
    const count = await prisma.ordem_producao_movimentacao_setor.count({
      where: { id_ordem_producao: f.op },
    })
    const trigger = `rollback_lote_${f.empresa}`
    await db.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON auditoria FOR EACH ROW BEGIN IF NEW.id_empresa=${f.empresa} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='falha local intencional'; END IF; END`,
    )
    try {
      await envio(f, 10, 0, randomUUID(), 500)
    } finally {
      await db.query(`DROP TRIGGER ${trigger}`)
    }
    assert.equal(
      await prisma.ordem_producao_movimentacao_setor.count({
        where: { id_ordem_producao: f.op },
      }),
      count,
    )
    assert.equal(
      (await posicoes(f)).posicoes[0].etapas[0].disponivelEnvio,
      "40.000",
    )
  })
  await test("Perdas, correções e estornos não recriam peças enviadas; fracionárias exatas", async () => {
    const f = await fixture(2, "1.125")
    const a = await apontar(f, "1.000", 0, "0.125")
    const m = await envio(f, "0.333")
    await receber(f, m.idMovimentacao, "0.111")
    await receber(f, m.idMovimentacao, "0.222")
    let p = (await posicoes(f)).posicoes[0].etapas
    assert.deepEqual(
      [p[0].disponivelEnvio, p[0].perdida, p[1].entrada],
      ["0.667", "0.125", "0.333"],
    )
    await call(
      f,
      `/api/ordens-producao/${f.op}/apontamentos/${a.apontamento.id}/estornar`,
      "POST",
      { motivo: "Tentativa de estorno após envio" },
      409,
      randomUUID(),
    )
    await call(
      f,
      `/api/ordens-producao/${f.op}/apontamentos/${a.apontamento.id}/corrigir`,
      "POST",
      {
        quantidadeProduzida: "0.300",
        quantidadePerdida: "0.825",
        motivoPerda: "Ajuste de perda",
        dataApontamento: diaOperacional(new Date()),
        motivoCorrecao: "Tentativa abaixo do enviado",
      },
      409,
      randomUUID(),
    )
    await apontar(f, "0.334", 1, "0", 409)
    assert.equal((await posicoes(f)).posicoes[0].etapas[0].produzida, "1.000")
  })
  await test("Isolamento, setor do responsável, destinos, precisão e histórico legado", async () => {
    const f = await fixture(3)
    await apontar(f, 100)
    await call(
      f,
      `/api/ordens-producao/${f.op}/movimentacoes`,
      "POST",
      {
        idEtapaOrigem: f.etapas[0].id,
        idEtapaDestino: f.etapas[2].id,
        itens: linha(f, 10),
      },
      409,
      randomUUID(),
    )
    for (const q of ["0", "-1", "0.0001", "1000000000000.000"])
      await envio(f, q, 0, randomUUID(), 400)
    await call(
      f,
      `/api/ordens-producao/${f.op}/movimentacoes`,
      "POST",
      {
        idEtapaOrigem: f.etapas[0].id,
        idEtapaDestino: f.etapas[1].id,
        itens: linha(f, 10),
      },
      400,
    )
    await prisma.usuario_empresa.update({
      where: { id: f.vinculo },
      data: { nivel_acesso: "USUARIO", id_setor: f.etapas[2].id_setor },
    })
    f.token = (
      await (
        await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: f.email, password: f.senha }),
        })
      ).json()
    ).accessToken
    await envio(f, 1, 0, randomUUID(), 403)
    await prisma.usuario_empresa.update({
      where: { id: f.vinculo },
      data: { nivel_acesso: "EMPRESA" },
    })
    f.token = (
      await (
        await fetch(base + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: f.email, password: f.senha }),
        })
      ).json()
    ).accessToken
    const other = await fixture()
    await call(
      other,
      `/api/ordens-producao/${f.op}/movimentacoes`,
      "GET",
      undefined,
      404,
    )
    await call(
      f,
      `/api/ordens-producao/${f.op}/movimentacoes`,
      "POST",
      {
        idEtapaOrigem: f.etapas[0].id,
        idEtapaDestino: other.etapas[1].id,
        itens: linha(f, 1),
      },
      409,
      randomUUID(),
    )
    await concluir(f, 0)
    await call(
      f,
      `/api/ordem_producao/${f.op}/etapas/${f.etapas[1].id}/iniciar`,
      "POST",
      {},
      200,
      randomUUID(),
    )
    await envio(f, 1, 0, randomUUID(), 409)
    const legado = await posicoes(f)
    assert.equal(legado.protocoloQuantitativo, false)
    assert.equal(legado.itens[0].idItem, f.item)
    assert.equal(legado.resumoLegado[0].etapas[1].disponivel, "100.000")
    assert.equal(legado.posicoes.length, 0)
    await apontar(f, 10, 1)
    writeFileSync(".local/lotes-legacy-ui.json", JSON.stringify(f))
  })
  await test("Mesmo produto com variações distintas conserva cada linha sem agregação", async () => {
    const f = await fixture(2, "100", true)
    await apontar(f, 100)
    await apontar({ ...f, item: f.item2 }, 100)
    const body = {
      idEtapaOrigem: f.etapas[0].id,
      idEtapaDestino: f.etapas[1].id,
      itens: [...linha(f, 60), ...linha({ ...f, item: f.item2 }, 30)],
    }
    const m = await call(
      f,
      `/api/ordens-producao/${f.op}/movimentacoes`,
      "POST",
      body,
      201,
      randomUUID(),
    )
    await call(
      f,
      `/api/ordens-producao/${f.op}/movimentacoes/${m.idMovimentacao}/receber`,
      "POST",
      { itens: [...linha(f, 20), ...linha({ ...f, item: f.item2 }, 10)] },
      201,
      randomUUID(),
    )
    const p = (await posicoes(f)).posicoes
    assert.equal(p.length, 2)
    assert.equal(p[0].idProduto, p[1].idProduto)
    assert.notEqual(p[0].idCor, p[1].idCor)
    assert.deepEqual(
      p.map((i) => [
        i.etapas[0].disponivelEnvio,
        i.etapas[0].emTransito,
        i.etapas[1].entrada,
      ]),
      [
        ["40.000", "40.000", "20.000"],
        ["70.000", "20.000", "10.000"],
      ],
    )
  })
  await test("Pausa com parcela em trânsito preserva correção legítima e retomada", async () => {
    const f = await fixture()
    const a = await apontar(f, 100)
    const m = await envio(f, 20)
    await call(f, `/api/ordem_producao/${f.op}/pausar`, "POST", {}, 200)
    const corrigido = await call(
      f,
      `/api/ordens-producao/${f.op}/apontamentos/${a.apontamento.id}/corrigir`,
      "POST",
      {
        quantidadeProduzida: "90",
        quantidadePerdida: "10",
        motivoPerda: "Perda confirmada em conferência",
        dataApontamento: diaOperacional(new Date()),
        motivoCorrecao: "Conferência durante pausa",
      },
      201,
      randomUUID(),
    )
    const p = (await posicoes(f)).posicoes[0].etapas[0]
    assert.equal(p.disponivelEnvio, "70.000")
    await receber(f, m.idMovimentacao, 20, randomUUID(), 409)
    writeFileSync(
      ".local/lotes-pausada-ui.json",
      JSON.stringify({ ...f, apontamento: corrigido.apontamento.id }),
    )
    await call(f, `/api/ordem_producao/${f.op}/retomar`, "POST", {}, 200)
    await receber(f, m.idMovimentacao, 20)
    await call(f, `/api/ordem_producao/${f.op}/pausar`, "POST", {}, 200)
  })
  await test("Fixture persistente para validação no navegador", async () => {
    const f = await fixture()
    await apontar(f, 100)
    writeFileSync(".local/lotes-ui.json", JSON.stringify({ ...f, base }))
  })
} finally {
  server?.kill()
  writeFileSync(".local/lotes-http.json", JSON.stringify(log, null, 2))
  await db.end()
  await prisma.$disconnect()
  hooks.deregister()
}
