import assert from "node:assert/strict"
import { test } from "node:test"
import { randomUUID, randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"
import mariadb from "mariadb"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"
const url = bancoLocal(process.env.NOTAS_ENTRADA_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = "notas-local-" + randomUUID()
delete process.env.DEV_ID_USUARIO
delete process.env.DEV_ID_EMPRESA
const hooks = typescript(),
  { prisma } = await import("../src/lib/prisma.ts"),
  { hashPassword } = await import("../src/modules/auth/auth.service.ts")
const db = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
})
let server, base
const log = []
async function call(f, path, method = "GET", body, expected = 200, key) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${f.token}`,
      "X-Empresa-Id": String(f.empresa),
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const v = await r.json()
  log.push({ path, method, expected, status: r.status, body: v })
  if (expected !== null) assert.equal(r.status, expected, JSON.stringify(v))
  return expected === null
    ? { status: r.status, body: v.data ?? v }
    : (v.data ?? v)
}
function chave() {
  const s = [...randomBytes(43)].map((b) => b % 10).join("")
  let soma = 0,
    p = 2
  for (let i = 42; i >= 0; i--) {
    soma += Number(s[i]) * p
    p = p === 9 ? 2 : p + 1
  }
  const r = soma % 11
  return s + String(r < 2 ? 0 : 11 - r)
}
async function login(f) {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: f.email, password: f.senha }),
  })
  assert.equal(r.status, 200)
  f.token = (await r.json()).accessToken
  assert.ok(f.token)
}
async function fixture(grade = false) {
  const marca = randomUUID().slice(0, 8),
    id = String(
      BigInt("0x" + randomBytes(6).toString("hex")) % 100000000000000n,
    ).padStart(14, "0")
  const e = await prisma.empresas.create({
      data: { razao_social: `Fiscal ${marca}`, cnpj: id },
    }),
    cargo = await prisma.cargos.create({
      data: { id_empresa: e.id, nome: "Produção" },
    })
  const senha = "Local#Fiscal2026",
    u = await prisma.usuarios.create({
      data: {
        nome: "Fiscal HTTP",
        email: `${marca}@notas.example.test`,
        senha: await hashPassword(senha),
      },
    })
  const v = await prisma.usuario_empresa.create({
    data: {
      id_empresa: e.id,
      id_usuario: u.id,
      id_cargo: cargo.id,
      nivel_acesso: "EMPRESA",
    },
  })
  const fornecedor = await prisma.fornecedores.create({
    data: { id_empresa: e.id, razao_social: `Fornecedor ${marca}` },
  })
  const local = await prisma.locais_estoque.create({
      data: { id_empresa: e.id, nome: "Recepção" },
    }),
    setor = await prisma.setores.create({
      data: { id_empresa: e.id, nome: "Almoxarifado" },
    })
  const tipo = await prisma.tipos_produto.create({
      data: { nome: `Fiscal ${marca}` },
    }),
    produto = await prisma.produtos.create({
      data: {
        id_tipo_produto: tipo.id,
        codigo: marca,
        nome: "Material fiscal",
        unidade: "UN",
        permite_compra: true,
        controla_estoque: true,
      },
    })
  await prisma.produto_empresa.create({
    data: { id_empresa: e.id, id_produto: produto.id },
  })
  let variacao = null
  if (grade) {
    const cor = await prisma.cores.create({
      data: { id_empresa: e.id, nome: "Azul" },
    })
    variacao = await prisma.produto_variacoes.create({
      data: { id_empresa: e.id, id_produto: produto.id, id_cor: cor.id },
    })
  }
  const categoria = await prisma.categoria_financeira.create({
    data: { id_empresa: e.id, nome: "Materiais", tipo: "DESPESA" },
  })
  const f = {
    empresa: e.id,
    usuario: u.id,
    vinculo: v.id,
    cargo: cargo.id,
    email: u.email,
    senha,
    fornecedor: fornecedor.id,
    produto: produto.id,
    local: local.id,
    setor: setor.id,
    variacao: variacao?.id ?? null,
  }
  await login(f)
  const compra = await call(
    f,
    "/api/compras/compras",
    "POST",
    {
      rascunho: true,
      idFornecedor: f.fornecedor,
      idLocalEstoque: f.local,
      itens: [
        { idProduto: f.produto, quantidade: "10", valorUnitario: "10.00" },
      ],
    },
    201,
  )
  f.compra = compra.compra.id
  await call(f, `/api/compras/compras/${f.compra}/acao`, "POST", {
    acao: "confirmar",
    idCategoria: categoria.id,
    vencimentos: ["2027-02-20"],
  })
  f.item = (
    await prisma.compra_itens.findFirstOrThrow({
      where: { id_compra: f.compra },
    })
  ).id
  assert.equal(
    await prisma.contas_pagar.count({ where: { id_compra: f.compra } }),
    1,
  )
  return f
}
const linha = (f, q, n = 1) => ({
  numeroItem: n,
  codigo: `FORN-${n}`,
  descricao: `Linha fiscal ${n}`,
  idProduto: f.produto,
  idCompraItem: f.item,
  idVariacao: f.variacao,
  idLocalEstoque: f.local,
  idSetor: f.setor,
  quantidade: String(q),
  unidade: "UN",
  tipoValor: "UNITARIO",
  valorUnitario: "10.00",
  valorTotal: new Prisma.Decimal(q).mul(10).toFixed(2),
})
// Constructor loaded from the real generated Prisma client, without a numeric float path.
const { Prisma } = await import("../src/generated/prisma/client.ts")
async function nova(f, quantidades = [6], numero) {
  const itens = quantidades.map((q, i) => linha(f, q, i + 1)),
    total = itens
      .reduce((s, i) => s.plus(i.valorTotal), new Prisma.Decimal(0))
      .toFixed(2)
  const r = await call(
    f,
    "/api/compras/notas-fiscais",
    "POST",
    {
      numero: numero ?? String(BigInt("0x" + randomBytes(5).toString("hex"))),
      serie: "1",
      chaveAcesso: chave(),
      idFornecedor: f.fornecedor,
      idCompra: f.compra,
      valorTotal: total,
      itens,
    },
    201,
  )
  const n = (await call(f, `/api/compras/notas-fiscais/${r.nota.id}`)).nota
  assert.equal(n.itens.length, itens.length)
  return n
}
const plano = (n, novas = true, mov) => ({
  versaoEsperada: n.versao,
  linhas: n.itens.map((i) => ({
    idItem: i.id,
    novaQuantidade: novas ? i.quantidade : "0",
    recebimentos: novas
      ? []
      : [{ idMovimentacao: mov, quantidade: i.quantidade }],
  })),
})
const processar = (f, n, body = plano(n), key = randomUUID(), expected = 200) =>
  call(
    f,
    `/api/compras/notas-fiscais/${n.id}/processar`,
    "POST",
    body,
    expected,
    key,
  )
const receber = (f, q, key = randomUUID(), expected = 200) =>
  call(
    f,
    `/api/compras/compras/${f.compra}/receber`,
    "POST",
    {
      ...(q === undefined
        ? {}
        : {
            itens: [
              {
                idItemCompra: f.item,
                quantidade: String(q),
                ...(f.variacao ? { idVariacao: f.variacao } : {}),
              },
            ],
          }),
      idSetorDestino: f.setor,
      chaveIdempotencia: key,
    },
    expected,
  )
const fisico = async (f) => {
  const m = await prisma.movimentacao_estoque.findMany({
    where: {
      id_empresa: f.empresa,
      origem_tipo: "COMPRA_RECEBIMENTO",
      origem_id: f.compra,
      tipo: "ENTRADA_NF",
    },
    orderBy: { id: "asc" },
  })
  return {
    movimentos: m,
    total: m
      .reduce((s, i) => s.plus(i.quantidade), new Prisma.Decimal(0))
      .toFixed(3),
  }
}
const financeiro = (f) =>
  prisma.contas_pagar.findMany({
    where: { id_compra: f.compra },
    orderBy: { id: "asc" },
  })
try {
  ;({ server, base } = await httpProducao())
  await test("Notas parciais6+4: estoque10, Kardex, compra, vínculos e financeiro único", async () => {
    const f = await fixture(),
      antes = JSON.stringify(await financeiro(f)),
      a = await nova(f, [6]),
      b = await nova(f, [4]),
      key = randomUUID()
    await processar(f, a, plano(a), key)
    assert.equal((await fisico(f)).total, "6.000")
    let c = (await call(f, `/api/compras/compras/${f.compra}`)).compra
    assert.equal(c.itens[0].quantidadePendente, "4.000")
    await processar(f, a, plano(a), key)
    await processar(f, a, plano(a), randomUUID())
    await processar(
      f,
      a,
      { ...plano(a), versaoEsperada: a.versao + 10 },
      key,
      409,
    )
    await processar(f, b)
    assert.equal((await fisico(f)).total, "10.000")
    assert.equal(
      await prisma.nota_item_entrada.count({ where: { id_compra: f.compra } }),
      2,
    )
    c = (await call(f, `/api/compras/compras/${f.compra}`)).compra
    assert.equal(c.status, "ENTREGUE")
    assert.equal(c.itens[0].quantidadeRecebida, "10.000")
    await receber(f, undefined, randomUUID(), 409)
    const movimentos = (await fisico(f)).movimentos
    assert.equal(
      await prisma.kardex.count({
        where: { id_movimentacao: { in: movimentos.map((i) => i.id) } },
      }),
      2,
    )
    assert.equal(JSON.stringify(await financeiro(f)), antes)
    const atual = (await call(f, `/api/compras/notas-fiscais/${a.id}`)).nota
    assert.equal(atual.entradaProcessada, true)
    assert.equal(atual.alocacoes.length, 1)
    await call(
      f,
      `/api/compras/notas-fiscais/${a.id}/itens`,
      "PUT",
      {
        versaoEsperada: atual.versao,
        itens: atual.itens.map((i) => linha(f, i.quantidade, i.numeroItem)),
      },
      409,
    )
  })
  await test("Compra recebida antes das notas: associação6+4 ao mesmo movimento sem nova entrada", async () => {
    const f = await fixture()
    await receber(f, 10)
    const original = (await fisico(f)).movimentos[0]
    const a = await nova(f, [6]),
      b = await nova(f, [4])
    await processar(f, a, plano(a, false, original.id))
    await processar(f, b, plano(b, false, original.id))
    await processar(f, a, plano(a, false, original.id))
    const estado = await fisico(f)
    assert.equal(estado.total, "10.000")
    assert.equal(estado.movimentos.length, 1)
    assert.equal(
      await prisma.nota_item_entrada.count({
        where: { id_movimentacao: original.id },
      }),
      2,
    )
  })
  await test("Recebimento legado é vinculado uma vez e repartido entre linhas da mesma nota", async () => {
    const f = await fixture()
    await receber(f, 10)
    const mov = (await fisico(f)).movimentos[0]
    await prisma.compra_recebimento_linha.delete({
      where: { id_movimentacao: mov.id },
    })
    const n = await nova(f, [4, 6])
    const p = plano(n, false, mov.id)
    const key = randomUUID()
    await processar(f, n, p, key)
    await processar(f, n, p, key)
    const estado = await fisico(f)
    assert.equal(estado.total, "10.000")
    assert.deepEqual(
      estado.movimentos.map((m) => m.id),
      [mov.id],
    )
    const vinculo = await prisma.compra_recebimento_linha.findUniqueOrThrow({
      where: { id_movimentacao: mov.id },
    })
    assert.equal(vinculo.quantidade.toFixed(3), "10.000")
    const partes = await prisma.nota_item_entrada.findMany({
      where: { id_nota: n.id, id_movimentacao: mov.id },
      orderBy: { quantidade: "asc" },
    })
    assert.deepEqual(
      partes.map((v) => v.quantidade.toFixed(3)),
      ["4.000", "6.000"],
    )
  })
  await test("Recebimento documental permite completar o cabeçalho antes do processamento", async () => {
    const f = await fixture()
    const pedido = await prisma.pedido_compra.create({
      data: {
        id_empresa: f.empresa,
        id_fornecedor: f.fornecedor,
        id_usuario: f.usuario,
        numero: "PEDIDO-" + randomUUID(),
      },
    })
    const cabecalho = {
      numero: String(BigInt("0x" + randomBytes(5).toString("hex"))),
      serie: "1",
      chaveAcesso: chave(),
      idFornecedor: f.fornecedor,
      valorTotal: "61.00",
    }
    const criada = await call(
      f,
      "/api/compras/notas-fiscais",
      "POST",
      {
        ...cabecalho,
        idPedidoCompra: pedido.id,
      },
      201,
    )
    const url = `/api/compras/notas-fiscais/${criada.nota.id}`
    const recebida = await call(f, url + "/acao", "POST", { acao: "receber" })
    assert.equal(recebida.nota.status, "RECEBIDA")
    assert.equal(recebida.nota.entradaProcessada, false)
    const documental = await call(f, url, "PATCH", {
      ...cabecalho,
      valorTotal: "60.00",
      dataRecebimento: recebida.nota.dataRecebimento.slice(0, 10),
      versaoEsperada: recebida.nota.versao,
    })
    assert.equal(documental.nota.pedido.id, pedido.id)
    assert.equal(documental.nota.dataRecebimento, recebida.nota.dataRecebimento)
    const corrigido = {
      ...cabecalho,
      idCompra: f.compra,
      valorTotal: "60.00",
      versaoEsperada: documental.nota.versao,
    }
    const editada = await call(f, url, "PATCH", corrigido)
    assert.equal(editada.nota.status, "RECEBIDA")
    assert.equal(editada.nota.entradaProcessada, false)
    assert.equal(editada.nota.dataRecebimento, recebida.nota.dataRecebimento)
    assert.equal(editada.nota.compra.id, f.compra)
    assert.equal((await fisico(f)).total, "0.000")
    await call(f, url + "/itens", "PUT", {
      versaoEsperada: editada.nota.versao,
      itens: [linha(f, 6)],
    })
    const conferida = (await call(f, url)).nota
    await processar(f, conferida)
    assert.equal((await fisico(f)).total, "6.000")
    const processada = (await call(f, url)).nota
    await call(
      f,
      url,
      "PATCH",
      { ...corrigido, versaoEsperada: processada.versao },
      409,
    )
  })
  await test("Identidades físicas de compra direta e nota fiscal são distintas", async () => {
    for (const fiscalPrimeiro of [false, true]) {
      const f = await fixture()
      const inicial = await nova(f, [6])
      await prisma.nota_fiscal.update({
        where: { id: inicial.id },
        data: { versao: 123 },
      })
      const n = (await call(f, `/api/compras/notas-fiscais/${inicial.id}`)).nota
      const key = `nf-${n.id}-${n.versao}`
      if (fiscalPrimeiro) await processar(f, n)
      await receber(f, 4, key)
      if (!fiscalPrimeiro) await processar(f, n)
      const estado = await fisico(f)
      assert.equal(estado.total, "10.000")
      assert.equal(estado.movimentos.length, 2)
      const detalhe = await call(f, `/api/compras/compras/${f.compra}`)
      assert.equal(detalhe.compra.recebimentos.length, 2)
    }
  })
  await test("Recebimento parcial anterior, várias linhas do mesmo produto e variação", async () => {
    const f = await fixture(true)
    await receber(f, 4)
    const m = (await fisico(f)).movimentos[0]
    const a = await nova(f, [2, 4])
    await processar(f, a)
    const b = await nova(f, [1, 3])
    await processar(f, b, plano(b, false, m.id))
    const estado = await fisico(f)
    assert.equal(estado.total, "10.000")
    assert.ok(estado.movimentos.every((m) => m.id_variacao === f.variacao))
    const saldo = await prisma.estoque_variacao.findFirstOrThrow({
      where: { id_empresa: f.empresa, id_variacao: f.variacao },
    })
    assert.equal(saldo.quantidade.toFixed(3), "10.000")
    assert.equal(
      await prisma.nota_item_entrada.count({ where: { id_compra: f.compra } }),
      4,
    )
  })
  await test("Concorrência de processamentos e entre compra/nota mantém uma única entrada física", async () => {
    const f = await fixture(),
      a = await nova(f, [6]),
      key = randomUUID()
    const [x, y] = await Promise.all([
      processar(f, a, plano(a), key),
      processar(f, a, plano(a), key),
    ])
    assert.equal(x.nota.id, y.nota.id)
    assert.equal((await fisico(f)).total, "6.000")
    const g = await fixture(),
      b = await nova(g, [6])
    const r = await Promise.all([
      receber(g, undefined, randomUUID(), null),
      processar(g, b, plano(b), randomUUID(), null),
    ])
    assert.equal(r[0].status, 200)
    assert.ok([200, 400, 409].includes(r[1].status))
    assert.equal((await fisico(g)).total, "10.000")
    const atual = (await call(g, `/api/compras/notas-fiscais/${b.id}`)).nota
    if (!atual.entradaProcessada)
      await processar(
        g,
        atual,
        plano(atual, false, (await fisico(g)).movimentos[0].id),
      )
    assert.equal((await fisico(g)).total, "10.000")
  })
  await test("Falha intermediária de vínculo reverte todas as linhas e a mesma chave pode ser recuperada", async () => {
    const f = await fixture(),
      n = await nova(f, [3, 3]),
      key = randomUUID(),
      trigger = `nf_rollback_${f.empresa}`
    const antes = await prisma.nota_fiscal.findUniqueOrThrow({
      where: { id: n.id },
    })
    await db.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON nota_item_entrada FOR EACH ROW BEGIN IF NEW.id_empresa=${f.empresa} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='falha local intencional'; END IF; END`,
    )
    try {
      const r = await processar(f, n, plano(n), key, null)
      assert.ok(r.status >= 400)
    } finally {
      await db.query(`DROP TRIGGER ${trigger}`)
    }
    assert.equal((await fisico(f)).total, "0.000")
    assert.equal(
      await prisma.nota_item_entrada.count({ where: { id_nota: n.id } }),
      0,
    )
    assert.equal(
      await prisma.operacao_erp.count({
        where: { id_empresa: f.empresa, chave: key },
      }),
      0,
    )
    const depois = await prisma.nota_fiscal.findUniqueOrThrow({
      where: { id: n.id },
    })
    assert.equal(depois.versao, antes.versao)
    assert.equal(depois.entrada_processada, false)
    await processar(f, n, plano(n), key)
    assert.equal((await fisico(f)).total, "6.000")
  })
  await test("Validação de precisão, valores, unidade, vínculos externos e mapeamento incompleto sem efeitos", async () => {
    const f = await fixture(),
      g = await fixture(),
      n = await nova(f, [6])
    const endpoint = `/api/compras/notas-fiscais/${n.id}/itens`
    for (const patch of [
      { quantidade: "0" },
      { quantidade: "0.0001" },
      { valorUnitario: "10.001" },
      { valorTotal: "61.00" },
      { unidade: "KG" },
      { idCompraItem: g.item },
      { idLocalEstoque: g.local },
      { idSetor: g.setor },
      { idProduto: g.produto },
    ])
      await call(
        f,
        endpoint,
        "PUT",
        { versaoEsperada: n.versao, itens: [{ ...linha(f, 6), ...patch }] },
        400,
      )
    await call(f, endpoint, "PUT", {
      versaoEsperada: n.versao,
      itens: [
        {
          ...linha(f, 6),
          idProduto: null,
          idCompraItem: null,
          idLocalEstoque: null,
          idSetor: null,
        },
      ],
    })
    let atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
    await processar(f, atual, plano(atual), randomUUID(), 409)
    assert.equal((await fisico(f)).total, "0.000")
    await call(f, endpoint, "PUT", {
      versaoEsperada: atual.versao,
      itens: [linha(f, 6)],
    })
    atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
    await call(
      f,
      `/api/compras/notas-fiscais/${n.id}/processar`,
      "POST",
      plano(atual),
      400,
    )
    assert.equal(
      (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota.versao,
      atual.versao,
    )
    await processar(f, atual)
    assert.equal((await fisico(f)).total, "6.000")
  })
  await test("Duplicidade concorrente da chave fiscal e compra cancelada são recusadas", async () => {
    const f = await fixture(),
      k = chave(),
      body = {
        numero: "12345",
        serie: "1",
        chaveAcesso: k,
        idFornecedor: f.fornecedor,
        idCompra: f.compra,
        valorTotal: "60.00",
        itens: [linha(f, 6)],
      }
    const r = await Promise.all([
      call(f, "/api/compras/notas-fiscais", "POST", body, null),
      call(
        f,
        "/api/compras/notas-fiscais",
        "POST",
        { ...body, numero: "12346" },
        null,
      ),
    ])
    assert.deepEqual(r.map((r) => r.status).sort(), [201, 409])
    assert.equal(
      await prisma.nota_fiscal.count({ where: { chave_acesso: k } }),
      1,
    )
    await call(
      f,
      "/api/compras/notas-fiscais",
      "POST",
      { ...body, numero: "555", chaveAcesso: chave(), idFornecedor: 999999 },
      400,
    )
    const g = await fixture()
    await call(g, `/api/compras/compras/${g.compra}/acao`, "POST", {
      acao: "cancelar",
    })
    await call(
      g,
      "/api/compras/notas-fiscais",
      "POST",
      {
        ...body,
        chaveAcesso: chave(),
        idFornecedor: g.fornecedor,
        idCompra: g.compra,
      },
      409,
    )
  })
  await test("Permissão fiscal isolada não cria movimentos nem operações persistidas", async () => {
    const f = await fixture(),
      n = await nova(f, [6])
    await prisma.usuario_empresa.update({
      where: { id: f.vinculo },
      data: { nivel_acesso: "USUARIO" },
    })
    await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: f.vinculo,
        recurso: "NOTAS_FISCAIS",
        pode_ler: true,
        pode_editar: true,
        pode_criar: true,
      },
    })
    await login(f)
    await processar(f, n, plano(n), randomUUID(), 403)
    assert.equal((await fisico(f)).total, "0.000")
    assert.equal(
      await prisma.operacao_erp.count({
        where: { id_empresa: f.empresa, tipo: "PROCESSAR_NOTA_FISCAL" },
      }),
      0,
    )
  })
  await test("Valor parcial usa apenas as linhas e divergência exige justificativa explícita", async () => {
    const f = await fixture(),
      n = await nova(f, [6]),
      endpoint = `/api/compras/notas-fiscais/${n.id}/itens`
    await call(f, endpoint, "PUT", {
      versaoEsperada: n.versao,
      itens: [{ ...linha(f, 6), valorUnitario: "9.00", valorTotal: "54.00" }],
    })
    let atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
    assert.ok(atual.pendencias.length > 0)
    await processar(f, atual, plano(atual), randomUUID(), 409)
    await call(f, `/api/compras/notas-fiscais/${n.id}`, "PATCH", {
      numero: n.numero,
      serie: n.serie,
      chaveAcesso: n.chaveAcesso,
      idFornecedor: f.fornecedor,
      idCompra: f.compra,
      valorTotal: "54.00",
      versaoEsperada: atual.versao,
    })
    atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
    await call(f, endpoint, "PUT", {
      versaoEsperada: atual.versao,
      itens: atual.itens.map((i) => ({
        ...linha(f, 6),
        id: i.id,
        valorUnitario: "9.00",
        valorTotal: "54.00",
      })),
      justificativaValores: "Desconto documentado do fornecedor",
    })
    atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
    await processar(f, atual)
    assert.equal((await fisico(f)).total, "6.000")
    assert.equal((await financeiro(f))[0].valor_final.toFixed(2), "100.00")
  })
  await test("Renumeração e inclusão preservam a identidade de todas as linhas fiscais", async () => {
    for (const inverter of [false, true]) {
      const f = await fixture(),
        n = await nova(f, [6])
      const original = n.itens[0].id
      const itens = [
        { ...linha(f, 4), id: original, numeroItem: 2 },
        { ...linha(f, 2), numeroItem: 1 },
      ]
      await call(f, `/api/compras/notas-fiscais/${n.id}/itens`, "PUT", {
        versaoEsperada: n.versao,
        itens: inverter ? itens.reverse() : itens,
      })
      const atual = (await call(f, `/api/compras/notas-fiscais/${n.id}`)).nota
      assert.equal(atual.itens.length, 2)
      assert.equal(atual.itens.find((i) => i.numeroItem === 2).id, original)
      assert.notEqual(atual.itens.find((i) => i.numeroItem === 1).id, original)
      assert.equal(atual.somatorioItens, "60.00")
      await processar(f, atual)
      assert.equal((await fisico(f)).total, "6.000")
    }
  })
  await test("Primeiro vínculo da compra preserva IDs e dados das linhas já cadastradas", async () => {
    const f = await fixture()
    const cab = {
      numero: "200001",
      serie: "1",
      chaveAcesso: chave(),
      idFornecedor: f.fornecedor,
      valorTotal: "60.00",
    }
    const criada = (
      await call(
        f,
        "/api/compras/notas-fiscais",
        "POST",
        { ...cab, itens: [{ ...linha(f, 6), idCompraItem: null }] },
        201,
      )
    ).nota
    const antes = (await call(f, `/api/compras/notas-fiscais/${criada.id}`))
      .nota
    await call(f, `/api/compras/notas-fiscais/${criada.id}`, "PATCH", {
      ...cab,
      idCompra: f.compra,
      versaoEsperada: antes.versao,
    })
    let atual = (await call(f, `/api/compras/notas-fiscais/${criada.id}`)).nota
    assert.equal(atual.itens.length, 1)
    assert.equal(atual.itens[0].id, antes.itens[0].id)
    assert.equal(atual.itens[0].codigo, antes.itens[0].codigo)
    await call(f, `/api/compras/notas-fiscais/${criada.id}/itens`, "PUT", {
      versaoEsperada: atual.versao,
      itens: [{ ...linha(f, 6), id: atual.itens[0].id }],
    })
    atual = (await call(f, `/api/compras/notas-fiscais/${criada.id}`)).nota
    assert.equal(atual.itens[0].id, antes.itens[0].id)
    await processar(f, atual)
    assert.equal((await fisico(f)).total, "6.000")
  })
  await test("Fixture persistente de notas6+4 para navegador", async () => {
    const f = await fixture(),
      a = await nova(f, [6], "600001"),
      b = await nova(f, [4], "400001")
    writeFileSync(
      ".local/notas-ui.json",
      JSON.stringify({
        ...f,
        notas: [a.id, b.id],
        numeros: [a.numero, b.numero],
      }),
    )
    const g = await fixture()
    await receber(g, 10)
    const n = await nova(g, [10], "1000001")
    writeFileSync(
      ".local/notas-associacao-ui.json",
      JSON.stringify({ ...g, nota: n.id, numero: n.numero }),
    )
  })
} finally {
  server?.kill()
  writeFileSync(".local/notas-http-log.json", JSON.stringify(log, null, 2))
  await db.end()
  await prisma.$disconnect()
  hooks.deregister()
}
