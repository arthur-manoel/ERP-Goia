import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { once } from "node:events"
import { bancoLocal, httpProducao, typescript } from "./integracao-pedidos.mjs"

export const normalizar = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  )

export async function ambienteRecebiveis() {
  const url = process.env.RECEBIVEIS_TEST_DATABASE_URL
  bancoLocal(url)
  process.env.DATABASE_URL = url
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  delete process.env.DEV_ID_USUARIO
  delete process.env.DEV_ID_EMPRESA
  const hooks = typescript()
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = [],
    vinculos = [],
    clientes = [],
    categorias = [],
    variacoes = [],
    triggers = new Set()
  let prisma, server
  const marker = randomUUID().replaceAll("-", "").slice(0, 12)
  const tokens = []
  let base

  async function encerrar() {
    if (server?.exitCode === null) {
      const exited = once(server, "exit")
      server.kill()
      await exited
    }
    if (prisma) {
      for (const name of triggers)
        await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS \`${name}\``)
      if (empresas.length) {
        const scope = { in: empresas }
        const pedidos = await prisma.pedido_cliente.findMany({
          where: { id_empresa: scope },
          select: { id: true },
        })
        const idPedidos = { in: pedidos.map((p) => p.id) }
        await prisma.movimentacoes_financeiras.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.pagamentos_receber.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.contas_receber.deleteMany({ where: { id_empresa: scope } })
        await prisma.pedido_cliente_fechamento.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.item_venda.deleteMany({
          where: { venda: { id_empresa: scope } },
        })
        await prisma.venda.deleteMany({ where: { id_empresa: scope } })
        await prisma.pedido_cliente_entrega_item.deleteMany({
          where: { id_pedido_cliente: idPedidos },
        })
        await prisma.pedido_cliente_entrega.deleteMany({
          where: { id_pedido_cliente: idPedidos },
        })
        await prisma.pedido_cliente_historico.deleteMany({
          where: { id_pedido_cliente: idPedidos },
        })
        await prisma.pedido_cliente_item.deleteMany({
          where: { id_pedido_cliente: idPedidos },
        })
        await prisma.pedido_cliente.deleteMany({ where: { id_empresa: scope } })
        await prisma.auditoria.deleteMany({
          where: {
            OR: [{ id_empresa: scope }, { id_usuario: { in: usuarios } }],
          },
        })
        await prisma.refresh_tokens.deleteMany({
          where: { id_usuario: { in: usuarios } },
        })
        await prisma.produto_variacoes.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.produto_empresa.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.cores.deleteMany({ where: { id_empresa: scope } })
        await prisma.tamanhos.deleteMany({ where: { id_empresa: scope } })
        await prisma.clientes.deleteMany({ where: { id_empresa: scope } })
        await prisma.condicoes_pagamento.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.categoria_financeira.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.sequencias_automaticas.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.usuario_empresa.deleteMany({
          where: { id_empresa: scope },
        })
        await prisma.cargos.deleteMany({ where: { id_empresa: scope } })
        await prisma.empresas.deleteMany({ where: { id: scope } })
      }
      await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
      await prisma.tipos_produto.deleteMany({ where: { id: { in: tipos } } })
      await prisma.$disconnect()
    }
    hooks.deregister()
  }

  try {
    ;({ prisma } = await import("../../src/lib/prisma.ts"))
    const { Prisma } = await import("../../src/generated/prisma/client.ts")
    for (const model of Object.values(Prisma.ModelName))
      assert.equal(
        await prisma[model].count(),
        0,
        `Banco dedicado deve estar vazio: ${model}`,
      )
    const { hashPassword } =
      await import("../../src/modules/auth/auth.service.ts")
    const password = randomBytes(24).toString("hex")
    const senha = await hashPassword(password)
    const cargos = []
    for (let i = 0; i < 2; i++) {
      empresas.push(
        (
          await prisma.empresas.create({
            data: {
              razao_social: `Recebíveis ${marker} ${i}`,
              cnpj: `${Date.now()}${i}`,
            },
          })
        ).id,
      )
      cargos.push({
        vendas: await prisma.cargos.create({
          data: { id_empresa: empresas[i], nome: "VENDAS" },
        }),
        financeiro: await prisma.cargos.create({
          data: { id_empresa: empresas[i], nome: "FINANCEIRO" },
        }),
      })
      clientes.push(
        await prisma.clientes.create({
          data: {
            id_empresa: empresas[i],
            nome_razao_social: `Cliente ${marker} ${i}`,
          },
        }),
      )
      categorias.push(
        await prisma.categoria_financeira.create({
          data: {
            id_empresa: empresas[i],
            nome: `Receitas ${marker}`,
            tipo: "RECEITA",
          },
        }),
      )
    }
    const perfis = [
      { admin: true },
      { pedidos: { pode_ler: true, pode_criar: true, pode_editar: true } },
      { financeiro: true, leituraFinanceira: true },
      { pedidos: { pode_ler: true } },
      { cadastros: true },
      { admin: true, empresa: 1 },
      { financeiro: true },
    ]
    const pessoas = []
    for (let i = 0; i < perfis.length; i++) {
      const perfil = perfis[i]
      const idx = perfil.empresa ?? 0
      const u = await prisma.usuarios.create({
        data: {
          nome: `Recebíveis ${i}`,
          email: `${marker}-${i}@recebiveis.example.test`,
          senha,
          nivel_acesso: perfil.admin ? "ADMIN" : "USUARIO",
        },
      })
      usuarios.push(u.id)
      pessoas.push(u)
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_usuario: u.id,
          id_empresa: empresas[idx],
          id_cargo: cargos[idx][perfil.financeiro ? "financeiro" : "vendas"].id,
        },
      })
      vinculos.push(vinculo)
      if (perfil.pedidos)
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "PEDIDOS",
            ...perfil.pedidos,
          },
        })
      if (perfil.leituraFinanceira)
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "FINANCEIRO",
            pode_ler: true,
          },
        })
      if (perfil.cadastros)
        for (const recurso of ["CLIENTES", "ESTOQUE"])
          await prisma.permissoes_usuario.create({
            data: {
              id_usuario_empresa: vinculo.id,
              recurso,
              pode_ler: true,
              pode_criar: true,
              pode_editar: true,
            },
          })
    }
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Recebíveis ${marker}` },
    })
    tipos.push(tipo.id)
    for (let i = 0; i < 2; i++) {
      const produto = await prisma.produtos.create({
        data: {
          id_tipo_produto: tipo.id,
          nome: `Produto ${marker} ${i}`,
          codigo: `${marker}-${i}`,
          permite_venda: true,
        },
      })
      produtos.push(produto.id)
      for (const id_empresa of empresas)
        await prisma.produto_empresa.create({
          data: { id_empresa, id_produto: produto.id, preco_venda: "100.00" },
        })
    }
    const cor = await prisma.cores.create({
      data: { id_empresa: empresas[0], nome: "Azul" },
    })
    for (const nome of ["M", "G"]) {
      const tamanho = await prisma.tamanhos.create({
        data: { id_empresa: empresas[0], nome },
      })
      variacoes.push(
        await prisma.produto_variacoes.create({
          data: {
            id_empresa: empresas[0],
            id_produto: produtos[1],
            id_cor: cor.id,
            id_tamanho: tamanho.id,
          },
        }),
      )
    }
    const http = await httpProducao()
    server = http.server
    base = http.base
    for (const pessoa of pessoas) {
      const login = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pessoa.email, password }),
      })
      assert.equal(login.status, 200, "Login real deve funcionar.")
      const data = await login.json()
      assert.ok(data.accessToken)
      tokens.push(data.accessToken)
    }
  } catch (error) {
    await encerrar()
    throw error
  }

  async function chamar(rota, method = "GET", body, op = {}) {
    const response = await fetch(base + rota, {
      method,
      headers: {
        ...(op.usuario === null
          ? {}
          : { Authorization: `Bearer ${op.token ?? tokens[op.usuario ?? 0]}` }),
        "X-Empresa-Id": String(op.empresa ?? empresas[0]),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(op.chave ? { "Idempotency-Key": op.chave } : {}),
        ...(op.versao === undefined ? {} : { "If-Match": `"${op.versao}"` }),
        ...op.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // A regressão de clientes preserva seu contrato anterior; as APIs de pedido
    // (incluindo fechamento/financeiro) exigem explicitamente cache privado.
    assert.equal(
      response.headers.get("Cache-Control"),
      rota.startsWith("/api/clientes/") ? "no-store" : "private, no-store",
    )
    return {
      status: response.status,
      body: await response.json(),
      etag: response.headers.get("ETag"),
    }
  }

  async function pedido(op = {}) {
    const idx = op.empresaIndex ?? 0
    const resposta = await chamar(
      "/api/pedidos",
      "POST",
      {
        idCliente: clientes[idx].id,
        dataEntregaPrevista: "2026-11-15",
        itens: op.itens ?? [
          {
            idProduto: produtos[0],
            quantidade: "1.000",
            precoPraticado: op.valor ?? "100.00",
          },
        ],
      },
      {
        chave: `recebiveis-${randomUUID()}`,
        empresa: empresas[idx],
        usuario: idx === 1 ? 5 : 0,
      },
    )
    assert.equal(resposta.status, 201, JSON.stringify(resposta.body))
    const id = resposta.body.idPedido
    const itens = await prisma.pedido_cliente_item.findMany({
      where: { id_pedido_cliente: id },
      orderBy: { numero_item: "asc" },
    })
    if (op.status !== null)
      await prisma.pedido_cliente.update({
        where: { id },
        data: { status: op.status ?? "ENTREGUE" },
      })
    let entrega
    if (op.entrega !== false) {
      const data = new Date(Date.now() - 60000)
      entrega = await prisma.pedido_cliente_entrega.create({
        data: {
          id_pedido_cliente: id,
          id_usuario: usuarios[idx === 1 ? 5 : 0],
          numero_entrega: 1,
          status: "RECEBIMENTO_CONFIRMADO",
          data_entrega: data,
          data_confirmacao_recebimento: data,
          nome_recebedor: "Cliente da fixture",
          pedido_cliente_entrega_item: {
            create: itens.map((item) => ({
              id_pedido_cliente_item: item.id,
              quantidade: item.quantidade,
            })),
          },
        },
      })
    }
    return { id, itens, entrega, versao: resposta.body.versao, idx }
  }

  const plano = (
    vencimentos = ["2026-11-10"],
    categoria = categorias[0].id,
  ) => ({
    idCategoriaFinanceira: categoria,
    vencimentos,
  })
  const fechar = (p, body = plano(), op = {}) =>
    chamar(`/api/pedidos/${p.id}/fechar`, "POST", body, {
      versao: p.versao,
      ...op,
    })
  const consultar = (p, op = {}) =>
    chamar(`/api/pedidos/${p.id}/conta-a-receber`, "GET", undefined, {
      usuario: 2,
      ...op,
    })
  async function persistido(p) {
    const vendas = await prisma.venda.findMany({
      where: { id_pedido_cliente: p.id },
      orderBy: { id: "asc" },
    })
    return normalizar({
      pedido: await prisma.pedido_cliente.findUnique({ where: { id: p.id } }),
      itens: await prisma.pedido_cliente_item.findMany({
        where: { id_pedido_cliente: p.id },
        orderBy: { id: "asc" },
      }),
      fechamentos: await prisma.pedido_cliente_fechamento.findMany({
        where: { id_pedido_cliente: p.id },
        orderBy: { id: "asc" },
      }),
      vendas,
      itensVenda: await prisma.item_venda.findMany({
        where: { id_venda: { in: vendas.map((v) => v.id) } },
        orderBy: { id: "asc" },
      }),
      contas: await prisma.contas_receber.findMany({
        where: { id_venda: { in: vendas.map((v) => v.id) } },
        orderBy: { numero_parcela: "asc" },
      }),
      auditoria: await prisma.auditoria.findMany({
        where: { id_empresa: empresas[p.idx] },
        orderBy: { id: "asc" },
      }),
      sequencias: await prisma.sequencias_automaticas.findMany({
        where: { id_empresa: empresas[p.idx] },
        orderBy: { entidade: "asc" },
      }),
    })
  }

  async function falhaControlada(tabela, predicado, operation) {
    assert.ok(["contas_receber", "auditoria"].includes(tabela))
    assert.match(predicado, /^[A-Za-z0-9_ =.]+$/)
    const name = `teste_recebiveis_${marker}_${triggers.size}`
    triggers.add(name)
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER \`${name}\` BEFORE INSERT ON \`${tabela}\` FOR EACH ROW BEGIN IF ${predicado} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha controlada em fixture local'; END IF; END`,
    )
    try {
      return await operation()
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS \`${name}\``)
      triggers.delete(name)
    }
  }

  return {
    prisma,
    empresas,
    usuarios,
    vinculos,
    clientes,
    categorias,
    produtos,
    variacoes,
    chamar,
    pedido,
    plano,
    fechar,
    consultar,
    persistido,
    falhaControlada,
    encerrar,
  }
}
