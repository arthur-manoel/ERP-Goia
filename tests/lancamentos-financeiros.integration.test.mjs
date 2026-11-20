import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { test } from "node:test"
import mariadb from "mariadb"
import {
  bancoLocal,
  httpProducao,
  typescript,
} from "./helpers/integracao-pedidos.mjs"

const url = bancoLocal(process.env.LANCAMENTOS_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = randomBytes(32).toString("hex")
const rota = "/api/financeiro/lancamentos"

test("Livro financeiro real: lançamentos, recebimento, autorização e atomicidade", async (t) => {
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
  let server
  try {
    const app = await httpProducao()
    server = app.server
    const marca = randomUUID()
    const cnpj = String(BigInt("0x" + randomBytes(5).toString("hex"))).padStart(
      13,
      "0",
    )
    const empresa = await prisma.empresas.create({
      data: { razao_social: "Caixa " + marca, cnpj: cnpj + "1" },
    })
    const outra = await prisma.empresas.create({
      data: { razao_social: "Outra " + marca, cnpj: cnpj + "2" },
    })
    const escopo = { id_empresa: empresa.id }
    const cargo = await prisma.cargos.create({
      data: { ...escopo, nome: "Financeiro" },
    })
    const senha = randomBytes(24).toString("hex"),
      email = marca + "@financeiro.example.test"
    const u = await prisma.usuarios.create({
      data: {
        nome: "Operador de caixa",
        email,
        senha: await hashPassword(senha),
      },
    })
    const vinculo = await prisma.usuario_empresa.create({
      data: {
        ...escopo,
        id_usuario: u.id,
        id_cargo: cargo.id,
        nivel_acesso: "USUARIO",
      },
    })
    const permissao = await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculo.id,
        recurso: "FINANCEIRO",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
      },
    })
    const conta = await prisma.contas_bancarias.create({
      data: {
        ...escopo,
        nome: "Caixa central",
        tipo: "CAIXA",
        saldo_inicial: "100.00",
      },
    })
    const contaFora = await prisma.contas_bancarias.create({
      data: { id_empresa: outra.id, nome: "Caixa externo", tipo: "CAIXA" },
    })
    const receita = await prisma.categoria_financeira.create({
      data: { ...escopo, nome: "Receita operacional", tipo: "RECEITA" },
    })
    const despesa = await prisma.categoria_financeira.create({
      data: { ...escopo, nome: "Despesa operacional", tipo: "DESPESA" },
    })
    const categoriaFora = await prisma.categoria_financeira.create({
      data: { id_empresa: outra.id, nome: "Externa", tipo: "AMBOS" },
    })
    const dia = new Date().toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo",
    })
    const login = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    })
    assert.equal(login.status, 200)
    const { accessToken } = await login.json()
    const chamar = async (
      path,
      method = "GET",
      body,
      key,
      expected = 200,
      empresaAtiva = empresa.id,
    ) => {
      const r = await fetch(app.base + path, {
        method,
        headers: {
          Authorization: "Bearer " + accessToken,
          "X-Empresa-Id": String(empresaAtiva),
          "Content-Type": "application/json",
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      const v = await r.json()
      if (expected !== null) assert.equal(r.status, expected, JSON.stringify(v))
      return { status: r.status, ...v }
    }
    const filtro = `de=${dia}&ate=${dia}&idConta=${conta.id}`
    const consulta = async (extra = "") =>
      (await chamar(`${rota}?${filtro}${extra}`)).data
    const entrada = {
      idConta: conta.id,
      idCategoria: receita.id,
      valor: "50.00",
      tipo: "ENTRADA",
      data: dia,
      descricao: "Entrada manual de conferência",
    }
    const saida = {
      ...entrada,
      idCategoria: despesa.id,
      valor: "20.00",
      tipo: "SAIDA",
      descricao: "Saída manual de conferência 20%",
    }
    const pos = await consulta()
    assert.equal(pos.conta.saldoAtual, "100.00")
    const key = randomUUID()
    const dupla = await Promise.all([
      chamar(rota, "POST", entrada, key, null),
      chamar(rota, "POST", entrada, key, null),
    ])
    assert.deepEqual(dupla.map((r) => r.status).sort(), [200, 201])
    assert.deepEqual(dupla[0].data, dupla[1].data)
    await chamar(rota, "POST", { ...entrada, valor: "51.00" }, key, 409)
    await chamar(rota, "POST", saida, randomUUID(), 201)
    assert.equal((await consulta()).conta.saldoAtual, "130.00")
    const v = await prisma.venda.create({
      data: {
        ...escopo,
        id_usuario: u.id,
        numero: marca,
        status: "FATURADA",
        status_financeiro: "FATURADA",
        valor_total: "100.00",
        valor_subtotal: "100.00",
      },
    })
    const dataTitulo = new Date(dia + "T12:00:00Z")
    const titulo = await prisma.contas_receber.create({
      data: {
        ...escopo,
        id_categoria: receita.id,
        id_venda: v.id,
        data_lancamento: dataTitulo,
        data_vencimento: dataTitulo,
        valor_original: "100.00",
        valor_final: "100.00",
        saldo: "100.00",
      },
    })
    const recebimento = {
      valor: "50.00",
      data: dia,
      formaPagamento: "PIX",
      idContaBancaria: conta.id,
    }
    const chaveReceber = randomUUID()
    const rotaReceber = `/api/contas_receber/${titulo.id}/recebimentos`
    const rec = await chamar(
      rotaReceber,
      "POST",
      recebimento,
      chaveReceber,
      201,
    )
    await chamar(rotaReceber, "POST", recebimento, chaveReceber, 200)
    assert.equal(
      await prisma.movimentacoes_financeiras.count({
        where: { ...escopo, origem: "RECEBIMENTO" },
      }),
      1,
    )
    assert.equal(
      (
        await prisma.contas_receber.findUniqueOrThrow({
          where: { id: titulo.id },
        })
      ).saldo.toFixed(2),
      "50.00",
    )
    const livro = await consulta()
    assert.equal(livro.conta.saldoAtual, "180.00")
    assert.deepEqual(livro.resumo, {
      entradas: "100.00",
      saidas: "20.00",
      liquido: "80.00",
    })
    assert.equal(livro.dados.length, 3)
    const vinculado = livro.dados.find((m) => m.origem === "RECEBIMENTO")
    assert.equal(vinculado.referencia.id, rec.data.idPagamento)
    assert.equal(vinculado.referencia.titulo, titulo.id)
    assert.equal(vinculado.categoria.id, receita.id)
    assert.equal((await consulta(`&idCategoria=${receita.id}`)).dados.length, 2)
    assert.equal((await consulta("&origem=RECEBIMENTO")).dados.length, 1)
    assert.equal((await consulta("&busca=%25")).resumo.liquido, "-20.00")
    assert.equal(
      (await consulta("&busca=entrada%20manual")).resumo.liquido,
      "50.00",
    )
    assert.equal(
      (await consulta("&busca=entrada%20manual")).conta.saldoAtual,
      "180.00",
    )
    assert.equal(
      (await chamar(rota + "/" + vinculado.id)).data.descricao,
      vinculado.descricao,
    )
    assert.equal(
      await prisma.auditoria.count({
        where: {
          ...escopo,
          id_usuario: u.id,
          tabela: "movimentacoes_financeiras",
          acao: "INSERT",
        },
      }),
      3,
    )

    await t.test(
      "IDs externos, precisão, data, criação em conta/categoria inativas",
      async () => {
        for (const [dados, status] of [
          [{ ...entrada, idConta: contaFora.id }, 404],
          [{ ...entrada, idCategoria: categoriaFora.id }, 404],
          [{ ...entrada, idCategoria: despesa.id }, 400],
          [{ ...entrada, valor: "0" }, 400],
          [{ ...entrada, valor: "0.001" }, 400],
          [{ ...entrada, valor: "99999999999999.99" }, 400],
          [{ ...entrada, data: "2099-01-01" }, 400],
          [{ ...entrada, idEmpresa: outra.id }, 400],
        ])
          await chamar(rota, "POST", dados, randomUUID(), status)
        await chamar(rota, "POST", entrada, undefined, 400)
        await chamar(
          rota + "?de=" + dia + "&ate=" + dia,
          "GET",
          undefined,
          undefined,
          403,
          outra.id,
        )
        await chamar(
          rota + `?de=${dia}&ate=${dia}&idConta=${contaFora.id}`,
          "GET",
          undefined,
          undefined,
          404,
        )
        await prisma.categoria_financeira.update({
          where: { id: receita.id },
          data: { status: "INATIVA" },
        })
        await chamar(rota, "POST", entrada, randomUUID(), 400)
        assert.equal(
          (await consulta(`&idCategoria=${receita.id}`)).dados.length,
          2,
        )
        await prisma.contas_bancarias.update({
          where: { id: conta.id },
          data: { status: "INATIVA" },
        })
        await chamar(rota, "POST", saida, randomUUID(), 400)
        assert.equal((await consulta()).conta.saldoAtual, "180.00")
        assert.ok(
          (await consulta()).dados.every((m) => m.conta.status === "INATIVA"),
        )
        await prisma.contas_bancarias.update({
          where: { id: conta.id },
          data: { status: "ATIVA" },
        })
        await prisma.categoria_financeira.update({
          where: { id: receita.id },
          data: { status: "ATIVA" },
        })
      },
    )

    await t.test(
      "Falha de auditoria reverte lançamento e permite repetir a mesma chave",
      async () => {
        const db = await mariadb.createConnection({
          host: url.hostname,
          port: Number(url.port),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
          database: url.pathname.slice(1),
        })
        const filtroOperacao = {
          where: { ...escopo, tipo: "LANCAMENTO_FINANCEIRO_MANUAL" },
        }
        const antes = await prisma.operacao_erp.count(filtroOperacao)
        const trigger = `falha_lancamento_${empresa.id}`
        const chave = randomUUID()
        const parcial = {
          ...entrada,
          valor: "0.10",
          descricao: "Valor fracionário recuperado",
        }
        try {
          await db.query(
            `CREATE TRIGGER ${trigger} BEFORE INSERT ON auditoria FOR EACH ROW BEGIN IF NEW.id_empresa=${empresa.id} AND NEW.tabela='movimentacoes_financeiras' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='falha local de auditoria'; END IF; END`,
          )
          await chamar(rota, "POST", parcial, chave, 500)
        } finally {
          await db.query(`DROP TRIGGER IF EXISTS ${trigger}`)
          await db.end()
        }
        assert.equal((await consulta()).conta.saldoAtual, "180.00")
        assert.equal(await prisma.operacao_erp.count(filtroOperacao), antes)
        await chamar(rota, "POST", parcial, chave, 201)
        assert.equal((await consulta()).conta.saldoAtual, "180.10")
      },
    )

    await t.test(
      "Paginação, despesa documentada e revogação antes de replay",
      async () => {
        const realizado = await prisma.despesas.create({
          data: {
            ...escopo,
            id_categoria: despesa.id,
            descricao: "Despesa já registrada",
            data_despesa: dataTitulo,
            valor: "2.00",
            situacao: "PAGA",
          },
        })
        await prisma.movimentacoes_financeiras.create({
          data: {
            ...escopo,
            id_conta_bancaria: conta.id,
            id_despesa: realizado.id,
            descricao: "Despesa no livro",
            data_movimentacao: dataTitulo,
            tipo: "SAIDA",
            origem: "DESPESA",
            valor: "2.00",
          },
        })
        assert.equal(
          (await consulta("&origem=DESPESA")).dados[0].categoria.id,
          despesa.id,
        )
        assert.equal((await consulta()).conta.saldoAtual, "178.10")
        const fornecedor = await prisma.fornecedores.create({
          data: { ...escopo, razao_social: "Fornecedor histórico" },
        })
        const local = await prisma.locais_estoque.create({
          data: { ...escopo, nome: "Recepção" },
        })
        const compra = await prisma.compras.create({
          data: {
            ...escopo,
            id_fornecedor: fornecedor.id,
            id_local_estoque: local.id,
            id_usuario: u.id,
            codigo: "Importada-" + marca,
            data_emissao: dataTitulo,
            status: "ENTREGUE",
          },
        })
        const tituloPagar = await prisma.contas_pagar.create({
          data: {
            ...escopo,
            id_compra: compra.id,
            id_categoria: despesa.id,
            data_vencimento: dataTitulo,
            valor_original: "3.00",
            valor_final: "3.00",
            situacao: "PAGO",
          },
        })
        const pago = await prisma.pagamentos_pagar.create({
          data: {
            ...escopo,
            id_conta_pagar: tituloPagar.id,
            valor: "3.00",
            data_pagamento: dataTitulo,
            forma_pagamento: "PIX",
          },
        })
        await prisma.movimentacoes_financeiras.create({
          data: {
            ...escopo,
            id_conta_bancaria: conta.id,
            id_pagamento_pagar: pago.id,
            descricao: "Pagamento histórico",
            tipo: "SAIDA",
            origem: "PAGAMENTO",
            valor: "3.00",
            data_movimentacao: dataTitulo,
          },
        })
        const pagamento = (await consulta("&origem=PAGAMENTO")).dados[0]
        assert.equal(pagamento.categoria.id, despesa.id)
        assert.equal(pagamento.referencia.titulo, tituloPagar.id)
        const fixture = Array.from({ length: 25 }, (_, i) => ({
          ...escopo,
          id_conta_bancaria: conta.id,
          descricao: `Importado ${i}`,
          data_movimentacao: dataTitulo,
          tipo: "SAIDA",
          origem: "TRANSFERENCIA",
          valor: "0.01",
        }))
        await prisma.movimentacoes_financeiras.createMany({ data: fixture })
        const primeira = await consulta("&pagina=1"),
          ultima = await consulta("&pagina=2")
        assert.equal(primeira.dados.length, 25)
        assert.equal(ultima.dados.length, 6)
        assert.equal(
          new Set([...primeira.dados, ...ultima.dados].map((m) => m.id)).size,
          31,
        )
        await prisma.permissoes_usuario.update({
          where: { id: permissao.id },
          data: { pode_criar: false },
        })
        await chamar(rota, "POST", entrada, key, 403)
        assert.equal((await consulta()).conta.saldoAtual, "174.85")
        await prisma.permissoes_usuario.update({
          where: { id: permissao.id },
          data: { pode_ler: false },
        })
        await chamar(rota + "?" + filtro, "GET", undefined, undefined, 403)
      },
    )
  } finally {
    server?.kill()
    await prisma.$disconnect()
    hooks.deregister()
  }
})
