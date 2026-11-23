import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import {
  bancoLocal,
  httpProducao,
  typescript,
} from "./helpers/integracao-pedidos.mjs"

test("Configuração de produtos por HTTP e MariaDB local", async (t) => {
  const database = bancoLocal(
    process.env.PRODUTO_CONFIGURACAO_TEST_DATABASE_URL,
  )
  process.env.DATABASE_URL = database.href
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  let server
  t.after(async () => {
    server?.kill()
    await prisma.$disconnect()
    hooks.deregister()
  })

  const marca = randomUUID().slice(0, 8)
  const senha = randomBytes(32).toString("hex")
  const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
  const hash = await hashPassword(senha)
  const empresas = []
  for (let i = 0; i < 2; i++) {
    const empresa = await prisma.empresas.create({
      data: {
        razao_social: `Catálogo ${marca}-${i}`,
        cnpj: `${Date.now()}${i}`,
        cargos: { create: { nome: "VENDAS" } },
      },
      include: { cargos: true },
    })
    empresas.push(empresa)
  }
  const [a, b] = empresas.map((empresa) => empresa.id)
  async function usuario(indice, em, permissoes) {
    const pessoa = await prisma.usuarios.create({
      data: {
        nome: `Catálogo ${indice}`,
        email: `${marca}-${indice}@catalogo.example.test`,
        senha: hash,
        nivel_acesso: permissoes ? "USUARIO" : "ADMIN",
      },
    })
    for (const empresa of em) {
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_empresa: empresa.id,
          id_usuario: pessoa.id,
          id_cargo: empresa.cargos[0].id,
        },
      })
      if (permissoes)
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "PRODUTOS",
            ...permissoes,
          },
        })
    }
    return pessoa
  }
  const administradora = await usuario("grade", empresas)
  const comercial = await usuario("comercial", empresas)
  const operadora = await usuario("operacao", empresas)
  const validador = await usuario("validacao", empresas)
  const leitor = await usuario("leitor", [empresas[0]], { pode_ler: true })
  const editor = await usuario("editor", [empresas[0]], {
    pode_ler: true,
    pode_editar: true,
  })
  const tipo = await prisma.tipos_produto.create({
    data: { nome: `Tipo ${marca}` },
  })
  async function produto(nome, vinculadas = [a], status = "ATIVO") {
    return prisma.produtos.create({
      data: {
        id_tipo_produto: tipo.id,
        nome,
        codigo: `${marca}-${nome}`,
        permite_compra: true,
        permite_venda: true,
        permite_producao: true,
        produto_empresa: {
          create: vinculadas.map((id_empresa) => ({ id_empresa, status })),
        },
      },
    })
  }
  const p = await produto("Compartilhado", [a, b])
  const outro = await produto("Outro")
  const legado = await produto("Legado")
  const bloqueado = await produto("Vínculo inativo", [a], "INATIVO")
  const externo = await produto("Externo", [b])
  const atomicidade = await produto("Atomicidade")
  const rota = (id = p.id) => `/api/produtos/${id}`
  const grade = (id) => `${rota(id)}/variacoes`
  const fornecedores = (id) => `${rota(id)}/fornecedores`
  const cor = await prisma.cores.create({ data: { nome: `Azul ${marca}` } })
  const cor2 = await prisma.cores.create({
    data: { nome: "Verde", id_empresa: a },
  })
  const cor3 = await prisma.cores.create({
    data: { nome: "Rosa", id_empresa: a },
  })
  const corOff = await prisma.cores.create({
    data: { nome: "Cinza", id_empresa: a, status: "INATIVA" },
  })
  const corB = await prisma.cores.create({
    data: { nome: "Vermelho", id_empresa: b },
  })
  const tam = await prisma.tamanhos.create({
    data: { nome: "M", id_empresa: a },
  })
  const tam2 = await prisma.tamanhos.create({
    data: { nome: "P", id_empresa: a },
  })
  const tamOff = await prisma.tamanhos.create({
    data: { nome: "G", id_empresa: a, status: "INATIVO" },
  })
  const tamB = await prisma.tamanhos.create({
    data: { nome: "M", id_empresa: b },
  })
  const local = await prisma.locais_estoque.create({
    data: { id_empresa: a, nome: "Loja" },
  })
  const setor = await prisma.setores.create({
    data: { id_empresa: a, nome: "Expedição" },
  })
  const cliente = await prisma.clientes.create({
    data: { id_empresa: a, nome_razao_social: "Cliente catálogo" },
  })
  async function fornecedor(nome, empresa, status = "ATIVO") {
    return prisma.fornecedores.create({
      data: { razao_social: nome, id_empresa: empresa, status },
    })
  }
  const especifico = await fornecedor("Fornecedor local", a)
  const global = await fornecedor("Fornecedor global", null)
  const semVinculo = await fornecedor("Global sem vínculo", null)
  const desativado = await fornecedor("Fornecedor inativo", a, "INATIVO")
  const fornecedorB = await fornecedor("Fornecedor B", b)
  const linkGlobal = await prisma.empresa_fornecedor.create({
    data: { id_empresa: a, id_fornecedor: global.id },
  })
  await prisma.empresa_fornecedor.create({
    data: { id_empresa: b, id_fornecedor: global.id },
  })
  const http = await httpProducao()
  server = http.server
  const login = async (pessoa) => {
    const res = await fetch(http.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pessoa.email, password: senha }),
    })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.accessToken)
    return data.accessToken
  }
  const token = await login(administradora)
  const tokenComercial = await login(comercial)
  const tokenOperacao = await login(operadora)
  const tokenValidacao = await login(validador)
  const tokenLeitura = await login(leitor)
  const tokenEdicao = await login(editor)
  async function chamar(path, status, op = {}) {
    const headers = { "X-Empresa-Id": String(op.empresa ?? a) }
    if (op.token !== null) headers.Authorization = `Bearer ${op.token ?? token}`
    if (op.selecao === false) delete headers["X-Empresa-Id"]
    if (op.body !== undefined || op.json !== undefined)
      headers["Content-Type"] = "application/json"
    const res = await fetch(http.base + path, {
      method: op.method ?? "GET",
      headers,
      body:
        op.json ??
        (op.body === undefined ? undefined : JSON.stringify(op.body)),
    })
    const resposta = await res.json()
    if (status === null) return { status: res.status, data: resposta.data }
    assert.equal(
      res.status,
      status,
      `${op.method ?? "GET"} ${path}: ${JSON.stringify(resposta)}`,
    )
    assert.equal(res.headers.get("Cache-Control"), "no-store")
    assert.equal(resposta.success, status < 400)
    return status < 400 ? resposta.data : resposta.error
  }
  const gerar = (id, variacoes, status = 201, op = {}) =>
    chamar(grade(id), status, { method: "POST", body: { variacoes }, ...op })
  const mudar = (id, variacao, situacao, status = 200, op = {}) =>
    chamar(`${grade(id)}/${variacao}`, status, {
      method: "PATCH",
      body: { status: situacao },
      ...op,
    })
  const vincular = (id, body, status = 201, op = {}) =>
    chamar(fornecedores(id), status, {
      method: "POST",
      body,
      token: tokenComercial,
      ...op,
    })
  const editar = (id, vinculo, body, status = 200, op = {}) =>
    chamar(`${fornecedores(id)}/${vinculo}`, status, {
      method: "PATCH",
      body,
      token: tokenComercial,
      ...op,
    })
  const sessaoB = { empresa: b }
  const combinacoes = [
    { id_cor: cor.id, id_tamanho: tam.id },
    { id_cor: cor.id, id_tamanho: tam2.id },
    { id_cor: cor.id },
    { id_tamanho: tam.id },
  ]
  let variacoes, link
  await t.test(
    "grade em lote, dimensões únicas, paginação, reenvio e histórico",
    async () => {
      const vazio = await chamar(grade(), 200)
      assert.deepEqual(vazio, {
        rows: [],
        count: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      })
      variacoes = (await gerar(p.id, [...combinacoes, combinacoes[0]])).rows
      assert.equal(variacoes.length, 4)
      assert.equal(variacoes[2].id_tamanho, null)
      assert.equal(variacoes[3].id_cor, null)
      const pagina = await chamar(grade() + "?page=2&limit=3", 200)
      assert.deepEqual(
        pagina.rows.map((v) => v.id),
        [variacoes[3].id],
      )
      assert.deepEqual([pagina.count, pagina.totalPages], [4, 2])
      assert.equal(
        (await chamar(grade() + "?page=3&limit=3", 200)).rows.length,
        0,
      )
      assert.equal((await chamar(grade() + "?page=1&limit=100", 200)).count, 4)
      await chamar(grade() + "?limit=101", 400)
      await chamar(grade() + "?page=1&page=2", 400)
      const item = await prisma.pedido_cliente.create({
        data: {
          id_empresa: a,
          id_cliente: cliente.id,
          id_usuario: administradora.id,
          numero: "Histórico",
          valor_total: "4",
          status: "CONCLUIDO",
          pedido_cliente_item: {
            create: {
              numero_item: 1,
              id_produto: p.id,
              id_variacao: variacoes[0].id,
              descricao: "Original",
              unidade: "UN",
              quantidade: "1",
              valor_unitario: "4",
              valor_total: "4",
            },
          },
        },
        include: { pedido_cliente_item: true },
      })
      await mudar(p.id, variacoes[0].id, "INATIVO", 403, { token: tokenEdicao })
      assert.equal(
        (await mudar(p.id, variacoes[0].id, "INATIVO")).status,
        "INATIVO",
      )
      const repetida = await gerar(p.id, combinacoes)
      assert.equal(repetida.criadas, 0)
      assert.equal(repetida.rows[0].status, "INATIVO")
      const mista = await gerar(p.id, [
        combinacoes[0],
        { id_cor: cor2.id, id_tamanho: tam.id },
      ])
      assert.equal(mista.criadas, 1)
      assert.equal(mista.rows[0].id, variacoes[0].id)
      assert.equal(mista.rows[0].status, "INATIVO")
      assert.equal(
        (
          await mudar(p.id, variacoes[0].id, "ATIVO", 200, {
            token: tokenEdicao,
          })
        ).id,
        variacoes[0].id,
      )
      assert.deepEqual(
        await prisma.pedido_cliente_item.findUnique({
          where: { id: item.pedido_cliente_item[0].id },
        }),
        item.pedido_cliente_item[0],
      )
      assert.equal(
        await prisma.movimentacao_estoque.count({
          where: { id_empresa: a, id_produto: p.id },
        }),
        0,
      )
    },
  )

  await t.test(
    "validação integral e concorrência de lotes sobrepostos",
    async () => {
      for (const invalidas of [
        [],
        [{}],
        [{ id_cor: null, id_tamanho: null }],
        [{ id_cor: 0 }],
        [{ id_cor: "1" }],
        [{ id_cor: cor.id, id_empresa: b }],
        Array.from({ length: 201 }, () => ({ id_cor: cor.id })),
        [{ id_cor: corOff.id }],
        [{ id_tamanho: tamOff.id }],
        [{ id_cor: corB.id }],
        [{ id_tamanho: tamB.id }],
        [{ id_cor: cor2.id }, { id_tamanho: 2_147_483_647 }],
      ])
        await gerar(outro.id, invalidas, 400, { token: tokenValidacao })
      assert.equal(
        await prisma.produto_variacoes.count({
          where: { id_empresa: a, id_produto: outro.id },
        }),
        0,
      )
      await gerar(bloqueado.id, [{ id_cor: cor.id }], 409)
      await gerar(externo.id, [{ id_cor: cor.id }], 404)
      const lotes = await Promise.all([
        gerar(outro.id, [
          { id_cor: cor2.id },
          { id_tamanho: tam.id },
          { id_cor: cor.id, id_tamanho: tam.id },
        ]),
        gerar(outro.id, [
          { id_cor: cor2.id },
          { id_tamanho: tam.id },
          { id_cor: cor.id, id_tamanho: tam.id },
          { id_cor: cor3.id },
        ]),
      ])
      assert.equal(lotes[0].criadas + lotes[1].criadas, 4)
      assert.deepEqual(
        lotes[0].rows.map((v) => v.id),
        lotes[1].rows.slice(0, 3).map((v) => v.id),
      )
      assert.equal(
        await prisma.produto_variacoes.count({
          where: { id_empresa: a, id_produto: outro.id },
        }),
        4,
      )
      assert.equal(
        await prisma.auditoria.count({
          where: {
            id_empresa: a,
            tabela: "produto_variacoes",
            id_registro: { in: lotes[1].rows.map((v) => v.id) },
          },
        }),
        4,
      )
      const alvo = lotes[0].rows[0]
      await mudar(outro.id, alvo.id, "INATIVO")
      await prisma.cores.update({
        where: { id: cor2.id },
        data: { status: "INATIVA" },
      })
      await mudar(outro.id, alvo.id, "ATIVO", 400)
      await prisma.cores.update({
        where: { id: cor2.id },
        data: { status: "ATIVA" },
      })
      await mudar(outro.id, alvo.id, "ATIVO")
    },
  )

  await t.test(
    "estoque, reservas e documentos anteriores ficam intactos",
    async () => {
      const posicao = await prisma.estoque.create({
        data: {
          id_empresa: a,
          id_produto: legado.id,
          id_setor: setor.id,
          id_local_estoque: local.id,
          quantidade: "1.250",
        },
      })
      assert.match(
        await gerar(legado.id, [{ id_cor: cor.id }], 409),
        /saldo sem grade/,
      )
      assert.deepEqual(
        await prisma.estoque.findUnique({ where: { id: posicao.id } }),
        posicao,
      )
      await prisma.estoque.update({
        where: { id: posicao.id },
        data: { quantidade: 0 },
      })
      const reserva = await prisma.reserva_estoque.create({
        data: {
          id_empresa: a,
          id_produto: legado.id,
          id_usuario: administradora.id,
          id_local_estoque: local.id,
          id_setor: setor.id,
          tipo_origem: "VENDA",
          quantidade: "1",
        },
      })
      assert.match(
        await gerar(legado.id, [{ id_cor: cor.id }], 409),
        /reserva ativa/,
      )
      await prisma.reserva_estoque.update({
        where: { id: reserva.id },
        data: { status: "CANCELADA" },
      })
      const pedido = await prisma.pedido_cliente.create({
        data: {
          id_empresa: a,
          id_cliente: cliente.id,
          id_usuario: administradora.id,
          numero: "Aberto",
          valor_total: "3",
          pedido_cliente_item: {
            create: {
              numero_item: 1,
              id_produto: legado.id,
              descricao: "Legado",
              unidade: "UN",
              quantidade: "1",
              valor_unitario: "3",
              valor_total: "3",
            },
          },
        },
      })
      assert.match(await gerar(legado.id, [{ id_cor: cor.id }], 409), /pedido/)
      await prisma.pedido_cliente.update({
        where: { id: pedido.id },
        data: { status: "CANCELADO" },
      })
      const ordem = await prisma.ordem_producao.create({
        data: {
          id_empresa: a,
          id_usuario: administradora.id,
          numero: "Legada",
          ordem_producao_item: {
            create: {
              id_produto: legado.id,
              tamanho: "Único",
              quantidade: "1",
            },
          },
        },
      })
      assert.match(
        await gerar(legado.id, [{ id_cor: cor.id }], 409),
        /ordem de produção/,
      )
      await prisma.ordem_producao.update({
        where: { id: ordem.id },
        data: { status: "CANCELADA" },
      })
      const criada = (await gerar(legado.id, [{ id_cor: cor.id }])).rows[0]
      await prisma.estoque.update({
        where: { id: posicao.id },
        data: { quantidade: "1.250" },
      })
      await prisma.estoque_variacao.create({
        data: {
          id_empresa: a,
          id_produto: legado.id,
          id_estoque: posicao.id,
          id_variacao: criada.id,
          quantidade: "1.250",
        },
      })
      assert.match(
        await mudar(legado.id, criada.id, "INATIVO", 409),
        /saldo físico/,
      )
      assert.equal(
        (
          await prisma.produto_variacoes.findUnique({
            where: { id: criada.id },
          })
        ).status,
        "ATIVO",
      )
      assert.equal(
        await prisma.movimentacao_estoque.count({
          where: { id_empresa: a, id_produto: legado.id },
        }),
        0,
      )
    },
  )

  await t.test(
    "fornecedores reais, preços decimais, histórico e principal",
    async () => {
      const opcoes = await chamar(
        fornecedores() + "/opcoes?page=1&limit=100",
        200,
        { token: tokenLeitura },
      )
      assert.deepEqual(
        opcoes.rows.map((x) => x.id),
        [especifico.id, global.id],
      )
      await vincular(p.id, { id_fornecedor: semVinculo.id }, 404, {
        token: tokenValidacao,
      })
      await vincular(p.id, { id_fornecedor: desativado.id }, 404)
      await vincular(p.id, { id_fornecedor: fornecedorB.id }, 404)
      await vincular(p.id, { id_fornecedor: 2_147_483_647 }, 404)
      for (const invalidos of [
        { codigo_produto_fornecedor: "X".repeat(101) },
        { preco_ultima_compra: "3.001" },
        { preco_ultima_compra: "99999999999999.00" },
        { preco_ultima_compra: -1 },
        { preco_ultima_compra: "-1" },
        { preco_ultima_compra: "1e3" },
        { prazo_entrega_dias: -1 },
        { prazo_entrega_dias: 1.5 },
        { prazo_entrega_dias: 2_147_483_648 },
        { quantidade_minima: "1.2345" },
        { fornecedor_principal: "true" },
      ])
        await vincular(
          p.id,
          { id_fornecedor: especifico.id, ...invalidos },
          400,
          { token: tokenValidacao },
        )
      const compra = await prisma.compras.create({
        data: {
          id_empresa: a,
          id_local_estoque: local.id,
          id_fornecedor: especifico.id,
          id_usuario: comercial.id,
          codigo: "Compra histórica",
          data_emissao: new Date(),
          compra_itens: {
            create: {
              id_produto: p.id,
              quantidade: "1",
              valor_unitario: "84.99",
              valor_total: "84.99",
            },
          },
        },
        include: { compra_itens: true },
      })
      link = await vincular(p.id, {
        id_fornecedor: especifico.id,
        codigo_produto_fornecedor: "  0007-Ç  ",
        preco_ultima_compra: "9999999999999.99",
        prazo_entrega_dias: 0,
        quantidade_minima: "0.125",
        fornecedor_principal: true,
      })
      assert.equal(link.codigo_produto_fornecedor, "0007-Ç")
      assert.equal(link.preco_ultima_compra, "9999999999999.99")
      assert.equal(link.prazo_entrega_dias, 0)
      assert.equal(link.quantidade_minima, "0.125")
      assert.equal(link.fornecedores.razao_social, especifico.razao_social)
      const atualizado = await editar(p.id, link.id, {
        codigo_produto_fornecedor: "0".repeat(100),
        preco_ultima_compra: "0",
      })
      assert.equal(atualizado.codigo_produto_fornecedor.length, 100)
      assert.equal(atualizado.preco_ultima_compra, "0.00")
      assert.equal(atualizado.prazo_entrega_dias, 0)
      assert.equal(atualizado.quantidade_minima, "0.125")
      const semPreco = await editar(p.id, link.id, {
        preco_ultima_compra: null,
        prazo_entrega_dias: 6,
      })
      assert.equal(semPreco.preco_ultima_compra, null)
      assert.equal(semPreco.prazo_entrega_dias, 6)
      assert.equal(
        (await chamar(`${fornecedores()}/${link.id}`, 200)).id,
        link.id,
      )
      assert.deepEqual(
        await prisma.compras.findUnique({
          where: { id: compra.id },
          include: { compra_itens: true },
        }),
        compra,
      )
      assert.equal(
        (await editar(p.id, link.id, { prazo_entrega_dias: null }))
          .prazo_entrega_dias,
        null,
      )
      const concorrentes = await Promise.all([
        vincular(
          p.id,
          { id_fornecedor: global.id, fornecedor_principal: true },
          null,
        ),
        vincular(
          p.id,
          { id_fornecedor: global.id, fornecedor_principal: true },
          null,
        ),
      ])
      assert.deepEqual(concorrentes.map((r) => r.status).sort(), [201, 409])
      const globalVinculo = concorrentes.find((r) => r.status === 201).data
      assert.equal(
        (await chamar(fornecedores() + "?limit=1&page=2", 200)).rows[0].id,
        globalVinculo.id,
      )
      assert.equal(
        (await chamar(`${fornecedores()}/${link.id}`, 200))
          .fornecedor_principal,
        false,
      )
      await editar(p.id, globalVinculo.id, { status: "INATIVO" }, 403, {
        token: tokenEdicao,
      })
      await prisma.empresa_fornecedor.update({
        where: { id: linkGlobal.id },
        data: { status: "INATIVO" },
      })
      assert.equal(
        (await chamar(`${fornecedores()}/${globalVinculo.id}`, 200))
          .fornecedor_principal,
        false,
      )
      await editar(p.id, globalVinculo.id, { codigo_produto_fornecedor: "09" })
      const inativo = await editar(p.id, globalVinculo.id, {
        status: "INATIVO",
      })
      assert.equal(inativo.status, "INATIVO")
      await editar(p.id, globalVinculo.id, { status: "ATIVO" }, 404)
      await prisma.empresa_fornecedor.update({
        where: { id: linkGlobal.id },
        data: { status: "ATIVO" },
      })
      await vincular(p.id, { id_fornecedor: global.id }, 409)
      const reativado = await editar(
        p.id,
        globalVinculo.id,
        { status: "ATIVO" },
        200,
        { token: tokenEdicao },
      )
      assert.equal(reativado.id, globalVinculo.id)
      assert.equal(reativado.fornecedor_principal, false)
      const concorrenciaPrincipal = await Promise.all([
        editar(p.id, link.id, { fornecedor_principal: true }),
        editar(p.id, globalVinculo.id, { fornecedor_principal: true }),
      ])
      assert.equal(concorrenciaPrincipal.length, 2)
      assert.equal(
        await prisma.produto_fornecedor.count({
          where: {
            id_empresa: a,
            id_produto: p.id,
            fornecedor_principal: true,
          },
        }),
        1,
      )
      assert.equal(
        await prisma.fornecedores.count({
          where: { id: global.id, status: "ATIVO" },
        }),
        1,
      )
      const outraEmpresa = await vincular(
        p.id,
        {
          id_fornecedor: global.id,
          codigo_produto_fornecedor: "B",
          preco_ultima_compra: "7.01",
        },
        201,
        sessaoB,
      )
      const outroProduto = await vincular(outro.id, {
        id_fornecedor: global.id,
        codigo_produto_fornecedor: "Outro",
      })
      assert.notEqual(outraEmpresa.id, globalVinculo.id)
      assert.notEqual(outroProduto.id, globalVinculo.id)
      assert.equal(outraEmpresa.preco_ultima_compra, "7.01")
      await editar(p.id, outraEmpresa.id, { prazo_entrega_dias: 2 }, 404)
      await editar(p.id, outroProduto.id, { prazo_entrega_dias: 2 }, 404)
      assert.equal((await chamar(fornecedores(), 200, sessaoB)).count, 1)
    },
  )

  await t.test("isolamento, identidade, autorização e revogação", async () => {
    assert.match(
      await chamar(grade(), 400, { method: "POST", json: "{" }),
      /JSON inválido/,
    )
    assert.match(
      await chamar(grade(), 400, { method: "POST", json: " ".repeat(65_537) }),
      /64 KiB/,
    )
    await chamar(grade(), 401, { token: null })
    await chamar(grade(), 400, { selecao: false })
    await chamar(grade(), 403, { token: tokenLeitura, empresa: b })
    await chamar(grade(externo.id), 404)
    await gerar(p.id, [{ id_cor: cor.id }], 403, { token: tokenLeitura })
    await vincular(p.id, { id_fornecedor: especifico.id }, 403, {
      token: tokenLeitura,
    })
    for (const path of [grade(), fornecedores(), fornecedores() + "/opcoes"])
      await chamar(path + "?id_empresa=" + b, 400)
    for (const chave of ["id", "id_empresa", "id_produto", "id_fornecedor"])
      await editar(p.id, link.id, { [chave]: b }, 400, { token: tokenOperacao })
    await editar(p.id, link.id, {}, 400, { token: tokenOperacao })
    await mudar(outro.id, variacoes[0].id, "ATIVO", 404)
    await mudar(p.id, variacoes[0].id, "ATIVO", 404, sessaoB)
    const naEmpresaB = await gerar(p.id, [{ id_tamanho: tamB.id }], 201, {
      ...sessaoB,
      token: tokenOperacao,
    })
    assert.equal(naEmpresaB.rows[0].id_empresa, b)
    assert.deepEqual(
      (await chamar(grade(), 200, sessaoB)).rows.map((v) => v.id),
      [naEmpresaB.rows[0].id],
    )
    await chamar(fornecedores(), 400, {
      token: tokenLeitura,
      method: "GET",
      selecao: false,
    })
    const res = await fetch(http.base + "/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenLeitura}` },
    })
    assert.ok(res.ok, `Logout ${res.status}`)
    await chamar(fornecedores(), 401, { token: tokenLeitura })
    assert.deepEqual(
      await prisma.produtos.findUnique({ where: { id: p.id } }),
      p,
    )
  })

  await t.test(
    "devolução vinculada preserva a variação histórica indisponível",
    async () => {
      const retorno = await produto("Devolução")
      const criada = (await gerar(retorno.id, [{ id_cor: cor3.id }])).rows[0]
      await mudar(retorno.id, criada.id, "INATIVO")
      await prisma.cores.update({
        where: { id: cor3.id },
        data: { status: "INATIVA" },
      })
      const dados = {
        idProduto: retorno.id,
        idVariacao: criada.id,
        idLocalEstoque: local.id,
        idSetor: setor.id,
        quantidade: "0.125",
        observacao: "Teste de retorno de item histórico",
      }
      const manual = await fetch(http.base + "/api/estoque/entradas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Empresa-Id": String(a),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dados),
      })
      assert.equal(manual.status, 404)
      await manual.body?.cancel()
      const { movimentarNaTransacao } =
        await import("../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository.ts")
      await prisma.$transaction((tx) =>
        movimentarNaTransacao(
          tx,
          { idEmpresa: a, idUsuario: administradora.id },
          dados,
          "entrada",
          {
            tipo: "AJUSTE_ENTRADA",
            nome: "DEVOLUCAO_PEDIDO",
            id: criada.id,
            chave: `test-retorno-${marca}`,
          },
        ),
      )
      const saldo = await prisma.estoque_variacao.findFirstOrThrow({
        where: {
          id_empresa: a,
          id_produto: retorno.id,
          id_variacao: criada.id,
        },
      })
      assert.equal(saldo.quantidade.toFixed(3), "0.125")
      assert.equal(
        (
          await prisma.produto_variacoes.findUnique({
            where: { id: criada.id },
          })
        ).status,
        "INATIVO",
      )
    },
  )

  await t.test(
    "erro da auditoria reverte um lote inteiro e a troca de principal",
    async () => {
      const inicial = await vincular(
        atomicidade.id,
        { id_fornecedor: especifico.id, fornecedor_principal: true },
        201,
        { token: tokenOperacao },
      )
      // O gatilho existe só no banco descartável de teste e simula uma falha
      // depois de alterar os registros, sem mudar o código do servidor.
      const trig = `falha_auditoria_${marca}`
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER \`${trig}\` BEFORE INSERT ON auditoria FOR EACH ROW
        BEGIN
          IF NEW.id_empresa = ${a} AND
            ((NEW.tabela = 'produto_variacoes' AND JSON_EXTRACT(NEW.dados_novos, '$.id_produto') = ${atomicidade.id}) OR
              (NEW.tabela = 'produto_fornecedor' AND NEW.acao = 'INSERT' AND JSON_EXTRACT(NEW.dados_novos, '$.id_produto') = ${atomicidade.id}))
          THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha da fixture'; END IF;
        END`,
      )
      try {
        await gerar(
          atomicidade.id,
          [{ id_cor: cor.id }, { id_tamanho: tam.id }],
          500,
          { token: tokenComercial },
        )
        await vincular(
          atomicidade.id,
          { id_fornecedor: global.id, fornecedor_principal: true },
          500,
          { token },
        )
        assert.equal(
          await prisma.produto_variacoes.count({
            where: { id_empresa: a, id_produto: atomicidade.id },
          }),
          0,
        )
        assert.equal(
          await prisma.produto_fornecedor.count({
            where: { id_empresa: a, id_produto: atomicidade.id },
          }),
          1,
        )
        assert.equal(
          (
            await prisma.produto_fornecedor.findUnique({
              where: { id: inicial.id },
            })
          ).fornecedor_principal,
          true,
        )
        assert.equal(
          await prisma.auditoria.count({
            where: {
              id_empresa: a,
              tabela: "produto_fornecedor",
              id_registro: inicial.id,
            },
          }),
          1,
        )
      } finally {
        await prisma.$executeRawUnsafe(`DROP TRIGGER \`${trig}\``)
      }
    },
  )
})
