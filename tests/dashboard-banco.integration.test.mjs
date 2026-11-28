import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"
import { tokenDeSessao } from "./helpers/sessao-integracao.mjs"

test("Dashboard: banco real, HTTP, prazos, isolamento e permissões", async () => {
  bancoLocal(process.env.DASHBOARD_TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.DASHBOARD_TEST_DATABASE_URL
  process.env.ACCESS_TOKEN_SECRET = randomUUID() + randomUUID()
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const { schemasDadosIndicadores } =
    await import("../src/lib/dashboard/validacao.ts")
  const { diaDoERP } = await import("../src/lib/dashboard/indicadores-reais.ts")
  const empresas = [],
    usuarios = []
  let server
  const marcador = randomUUID().slice(0, 8)
  const hoje = diaDoERP()
  const prazo = (dias) => new Date(hoje.getTime() + dias * 86400000)
  const primeiro = new Date(`${hoje.toISOString().slice(0, 7)}-01T03:00:00Z`)
  const proximoMes = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1, 3),
  )
  try {
    for (let i = 0; i < 3; i++)
      empresas.push(
        (
          await prisma.empresas.create({
            data: {
              razao_social: `Dashboard QA ${marcador} ${i}`,
              cnpj: `${Date.now()}${i}`,
            },
          })
        ).id,
      )
    const admin = await prisma.usuarios.create({
      data: {
        nome: "Dashboard admin",
        email: `${marcador}-admin@dashboard.example.test`,
        senha: "sem-login-por-senha",
        nivel_acesso: "ADMIN",
      },
    })
    usuarios.push(admin.id)
    const financeiro = await prisma.usuarios.create({
      data: {
        nome: "Dashboard financeiro",
        email: `${marcador}-fin@dashboard.example.test`,
        senha: "sem-login-por-senha",
      },
    })
    usuarios.push(financeiro.id)
    for (const idEmpresa of empresas.slice(0, 2)) {
      const cargo = await prisma.cargos.create({
        data: { id_empresa: idEmpresa, nome: "FINANCEIRO" },
      })
      for (const idUsuario of usuarios)
        await prisma.usuario_empresa.create({
          data: {
            id_empresa: idEmpresa,
            id_usuario: idUsuario,
            id_cargo: cargo.id,
          },
        })
    }
    const cliente = await prisma.clientes.create({
      data: {
        id_empresa: empresas[0],
        nome_razao_social: "Cliente dashboard QA",
      },
    })
    const pedidos = [
      ["CONFIRMADO", -3],
      ["EM_PRODUCAO", 0],
      ["PRONTO", 1],
      ["EM_ENTREGA", 7],
      ["PARCIALMENTE_ENTREGUE", 8],
      ["CONFIRMADO", null],
      ["RASCUNHO", -5],
      ["ENTREGUE", -5],
      ["CONCLUIDO", -5],
      ["CANCELADO", -5],
    ]
    for (const [indice, [status, dias]] of pedidos.entries())
      await prisma.pedido_cliente.create({
        data: {
          id_empresa: empresas[0],
          id_cliente: cliente.id,
          id_usuario: admin.id,
          numero: `QA-${indice}`,
          status,
          data_previsao_entrega: dias === null ? null : prazo(dias),
        },
      })
    for (const [indice, status] of [
      "PLANEJADA",
      "EM_PRODUCAO",
      "PAUSADA",
      "CONCLUIDA",
      "CANCELADA",
    ].entries())
      await prisma.ordem_producao.create({
        data: {
          id_empresa: empresas[0],
          id_usuario: admin.id,
          numero: `QA-${indice}`,
          status,
          data_previsao: indice === 0 ? null : prazo(indice === 1 ? -2 : 0),
        },
      })
    const banco = await prisma.contas_bancarias.create({
      data: { id_empresa: empresas[0], nome: "Caixa QA", tipo: "CAIXA" },
    })
    for (const [tipo, valor, origem, data] of [
      ["ENTRADA", "0.10", "AJUSTE", primeiro],
      ["SAIDA", "0.30", "AJUSTE", new Date(proximoMes.getTime() - 1)],
      ["ENTRADA", "9000.00", "AJUSTE", new Date(primeiro.getTime() - 1)],
      ["ENTRADA", "9000.00", "AJUSTE", proximoMes],
      ["ENTRADA", "9999.00", "TRANSFERENCIA", primeiro],
    ])
      await prisma.movimentacoes_financeiras.create({
        data: {
          id_empresa: empresas[0],
          id_conta_bancaria: banco.id,
          tipo,
          valor,
          origem,
          data_movimentacao: data,
          descricao: "Dashboard QA",
        },
      })
    const token = await tokenDeSessao(prisma, admin.id, "ADMINISTRACAO")
    const tokenFin = await tokenDeSessao(prisma, financeiro.id, "FINANCEIRO")
    const http = await httpProducao()
    server = http.server
    const consultar = (indicador, idEmpresa = empresas[0], bearer = token) =>
      fetch(`${http.base}/api/dashboard/${indicador}`, {
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          "X-Empresa-Id": String(idEmpresa),
        },
      })
    const dados = async (indicador, idEmpresa = empresas[0]) => {
      const r = await consultar(indicador, idEmpresa)
      assert.equal(r.status, 200, await r.clone().text())
      assert.equal(r.headers.get("Cache-Control"), "no-store")
      const body = await r.json()
      assert.equal(body.data.estado, "ok")
      schemasDadosIndicadores[indicador].parse(body.data.dados)
      return body.data.dados
    }
    const estoqueHttp = (bearer = token) =>
      fetch(`${http.base}/api/estoque-minimo`, {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "X-Empresa-Id": String(empresas[0]),
        },
      })
    const estoque = await estoqueHttp()
    assert.equal(estoque.status, 200)
    const indicadorEstoque = schemasDadosIndicadores.estoque.parse(
      (await estoque.json()).indicador,
    )
    assert.equal(indicadorEstoque.total, 0)
    assert.equal((await estoqueHttp(tokenFin)).status, 403)
    const pedidosReais = await dados("pedidos")
    assert.deepEqual(pedidosReais, {
      total: 6,
      atrasados: 1,
      vencemHoje: 1,
      proximos: { quantidade: 2, janelaDias: 7 },
      maiorAtrasoEmDias: 3,
    })
    const ordens = await dados("ordens")
    assert.equal(ordens.total, 3)
    assert.equal(ordens.atrasadas, 1)
    assert.equal(
      ordens.porStatus.reduce((s, p) => s + p.quantidade, 0),
      3,
    )
    assert.deepEqual(await dados("saldo"), {
      valor: "-0.20",
      entradas: "0.10",
      saidas: "0.30",
    })
    assert.equal((await dados("pedidos", empresas[1])).total, 0)
    assert.equal((await dados("ordens", empresas[1])).total, 0)
    assert.deepEqual(await dados("saldo", empresas[1]), {
      valor: "0.00",
      entradas: "0.00",
      saidas: "0.00",
    })
    for (const indicador of ["pedidos", "ordens", "saldo"]) {
      assert.equal((await consultar(indicador, empresas[0], null)).status, 401)
      assert.equal((await consultar(indicador, empresas[2])).status, 403)
      assert.equal(
        (await consultar(indicador, empresas[0], tokenFin)).status,
        403,
      )
    }
    const vinculo = await prisma.usuario_empresa.findFirstOrThrow({
      where: { id_usuario: financeiro.id, id_empresa: empresas[0] },
    })
    await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculo.id,
        recurso: "FINANCEIRO",
        pode_ler: true,
      },
    })
    assert.equal((await consultar("saldo", empresas[0], tokenFin)).status, 200)
    assert.equal((await consultar("saldo", empresas[1], tokenFin)).status, 403)
    await prisma.permissoes_usuario.updateMany({
      where: { id_usuario_empresa: vinculo.id },
      data: { pode_ler: false },
    })
    assert.equal((await consultar("saldo", empresas[0], tokenFin)).status, 403)
    // Isola a regra do vínculo: a leitura volta a ser permitida antes de inativá-lo.
    await prisma.permissoes_usuario.updateMany({
      where: { id_usuario_empresa: vinculo.id },
      data: { pode_ler: true },
    })
    await prisma.usuario_empresa.update({
      where: { id: vinculo.id },
      data: { status: "INATIVO" },
    })
    assert.equal((await consultar("saldo", empresas[0], tokenFin)).status, 403)
    await prisma.empresas.update({
      where: { id: empresas[1] },
      data: { status: "INATIVA" },
    })
    assert.equal((await consultar("pedidos", empresas[1])).status, 403)
    await prisma.usuarios.update({
      where: { id: admin.id },
      data: { status: "INATIVO" },
    })
    assert.equal((await consultar("pedidos")).status, 401)
    console.log(
      "Dashboard HTTP validada: status, prazos, saldo decimal, virada do mês, empresa vazia, isolamento e revogação de permissão.",
    )
  } finally {
    server?.kill()
    // Somente os registros criados por esta execução, em banco local dedicado.
    for (const model of [
      "movimentacoes_financeiras",
      "ordem_producao",
      "pedido_cliente",
      "clientes",
      "contas_bancarias",
      "usuario_empresa",
      "cargos",
    ])
      await prisma[model].deleteMany({
        where: { id_empresa: { in: empresas } },
      })
    await prisma.refresh_tokens.deleteMany({
      where: { id_usuario: { in: usuarios } },
    })
    await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
    await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
    await prisma.$disconnect()
    hooks.deregister()
  }
})
