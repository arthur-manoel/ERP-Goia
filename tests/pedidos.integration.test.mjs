import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { once } from "node:events"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"

test("Pedidos: persistência real, HTTP de produção, permissões e concorrência", async (t) => {
  const url = process.env.PEDIDOS_TEST_DATABASE_URL
  bancoLocal(url)
  process.env.DATABASE_URL = url
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  delete process.env.DEV_ID_USUARIO
  delete process.env.DEV_ID_EMPRESA
  const hooks = typescript()
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = []
  let prisma, server
  try {
    ;({ prisma } = await import("../src/lib/prisma.ts"))
    const { Prisma } = await import("../src/generated/prisma/client.ts")
    for (const model of Object.values(Prisma.ModelName))
      assert.equal(
        await prisma[model].count(),
        0,
        `Banco deve estar vazio: ${model}`,
      )
    const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
    const services = await import("../src/modules/pedidos/pedidos.service.ts")
    const repo = await import("../src/modules/pedidos/pedidos.repository.ts")
    const marker = randomUUID().slice(0, 8),
      password = randomBytes(24).toString("hex"),
      senha = await hashPassword(password)
    const cargos = [],
      pessoas = [],
      vinculos = [],
      clientes = []
    for (let i = 0; i < 2; i++) {
      empresas.push(
        (
          await prisma.empresas.create({
            data: {
              razao_social: `Pedidos ${marker} ${i}`,
              cnpj: `${Date.now()}${i}`,
            },
          })
        ).id,
      )
      cargos.push(
        await prisma.cargos.create({
          data: { id_empresa: empresas[i], nome: "VENDAS" },
        }),
      )
      clientes.push(
        await prisma.clientes.create({
          data: {
            id_empresa: empresas[i],
            nome_razao_social: `Cliente ${marker} ${i}`,
          },
        }),
      )
    }
    const flags = [
      null,
      { pode_ler: true },
      { pode_criar: true },
      { pode_editar: true },
      { pode_excluir: true },
      {},
      null,
    ]
    for (let i = 0; i < flags.length; i++) {
      const u = await prisma.usuarios.create({
        data: {
          nome: `Pedidos ${i}`,
          email: `${marker}-${i}@pedidos.example.test`,
          senha,
          nivel_acesso: flags[i] === null ? "ADMIN" : "USUARIO",
        },
      })
      usuarios.push(u.id)
      pessoas.push(u)
      const idx = i === 6 ? 1 : 0
      vinculos.push(
        await prisma.usuario_empresa.create({
          data: {
            id_usuario: u.id,
            id_empresa: empresas[idx],
            id_cargo: cargos[idx].id,
          },
        }),
      )
      if (flags[i])
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculos[i].id,
            recurso: "PEDIDOS",
            ...flags[i],
          },
        })
    }
    // Apenas CLIENTES nunca deve autorizar pedidos.
    await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculos[5].id,
        recurso: "CLIENTES",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
      },
    })
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Pedidos ${marker}` },
    })
    tipos.push(tipo.id)
    for (let i = 0; i < 6; i++) {
      const p = await prisma.produtos.create({
        data: {
          id_tipo_produto: tipo.id,
          nome: `Produto ${marker} ${i}`,
          codigo: `${marker}-${i}`,
          permite_venda: i !== 4,
          status: i === 3 ? "INATIVO" : "ATIVO",
        },
      })
      produtos.push(p.id)
      await prisma.produto_empresa.create({
        data: {
          id_empresa: i === 5 ? empresas[1] : empresas[0],
          id_produto: p.id,
          preco_venda: "99.99",
          status: i === 2 ? "INATIVO" : "ATIVO",
        },
      })
    }
    await prisma.produto_empresa.create({
      data: { id_empresa: empresas[1], id_produto: produtos[0] },
    })
    const corA = await prisma.cores.create({
      data: { id_empresa: empresas[0], nome: "Azul" },
    })
    const corB = await prisma.cores.create({
      data: { id_empresa: empresas[1], nome: "Vermelho" },
    })
    const tamanhos = []
    for (const nome of ["M", "G"])
      tamanhos.push(
        await prisma.tamanhos.create({
          data: { id_empresa: empresas[0], nome },
        }),
      )
    const variacoes = []
    for (const tamanho of tamanhos)
      variacoes.push(
        await prisma.produto_variacoes.create({
          data: {
            id_empresa: empresas[0],
            id_produto: produtos[0],
            id_cor: corA.id,
            id_tamanho: tamanho.id,
          },
        }),
      )
    const varB = await prisma.produto_variacoes.create({
      data: {
        id_empresa: empresas[1],
        id_produto: produtos[0],
        id_cor: corB.id,
      },
    })
    const varOutro = await prisma.produto_variacoes.create({
      data: {
        id_empresa: empresas[0],
        id_produto: produtos[3],
        id_cor: corA.id,
      },
    })
    const clienteInativo = await prisma.clientes.create({
      data: {
        id_empresa: empresas[0],
        nome_razao_social: "Inativo",
        status: "INATIVO",
      },
    })
    const legado = await prisma.pedido_cliente.create({
      data: {
        id_empresa: empresas[0],
        id_cliente: clientes[0].id,
        id_usuario: usuarios[0],
        numero: "LEGADO",
        valor_subtotal: "20.00",
        valor_total: "20.00",
        data_previsao_entrega: new Date("2026-11-15T00:00:00Z"),
        pedido_cliente_item: {
          create: {
            numero_item: 1,
            id_produto: produtos[0],
            id_cor: corA.id,
            id_tamanho: tamanhos[0].id,
            descricao: "Descrição legada",
            unidade: "UN",
            quantidade: "2.000",
            valor_unitario: "10.00",
            valor_total: "20.00",
          },
        },
      },
    })
    const venda = await prisma.venda.create({
      data: {
        id_empresa: empresas[0],
        id_cliente: clientes[0].id,
        id_usuario: usuarios[0],
        numero: "VENDA-LEGADA",
        valor_total: "15.00",
      },
    })
    const estrangeiro = await prisma.pedido_cliente.create({
      data: {
        id_empresa: empresas[1],
        id_cliente: clientes[1].id,
        id_usuario: usuarios[6],
        numero: "OUTRA-EMPRESA",
        valor_total: "30.00",
        pedido_cliente_item: {
          create: {
            numero_item: 1,
            id_produto: produtos[5],
            descricao: "Privado",
            unidade: "UN",
            quantidade: "1.000",
            valor_unitario: "30.00",
            valor_total: "30.00",
          },
        },
      },
    })
    const inicial = {
      venda: await prisma.venda.count(),
      contas: await prisma.contas_receber.count(),
      reservas: await prisma.reserva_estoque.count(),
      movimentos: await prisma.movimentacao_estoque.count(),
      ordens: await prisma.ordem_producao.count(),
    }
    const http = await httpProducao()
    server = http.server
    const tokens = []
    for (const u of pessoas) {
      const login = await fetch(http.base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.email, password }),
      })
      assert.equal(login.status, 200, "Login real deve funcionar.")
      const data = await login.json()
      assert.ok(data.accessToken)
      tokens.push(data.accessToken)
    }
    async function chamar(rota, method = "GET", body, op = {}) {
      const response = await fetch(http.base + rota, {
        method,
        headers: {
          Authorization: `Bearer ${op.token === undefined ? tokens[op.usuario ?? 0] : op.token}`,
          "X-Empresa-Id": String(op.empresa ?? empresas[0]),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(op.chave ? { "Idempotency-Key": op.chave } : {}),
          ...(op.versao === undefined ? {} : { "If-Match": `"${op.versao}"` }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      return {
        status: response.status,
        body: await response.json(),
        etag: response.headers.get("ETag"),
      }
    }
    const novoItem = {
      idProduto: produtos[0],
      idVariacao: variacoes[0].id,
      quantidade: "3.000",
      precoPraticado: "49.90",
    }
    const pedido = {
      idCliente: clientes[0].id,
      dataEntregaPrevista: "2026-11-15",
      itens: [
        novoItem,
        {
          ...novoItem,
          idVariacao: variacoes[1].id,
          quantidade: "2.000",
          precoPraticado: "54.90",
        },
      ],
    }
    const corpo = (
      itens = [
        {
          idProduto: produtos[1],
          quantidade: "1.000",
          precoPraticado: "10.00",
        },
      ],
    ) => ({ ...pedido, itens })
    const chave = () => `pedido-${randomUUID()}`
    const crear = async (body = pedido, op = {}) =>
      chamar("/api/pedidos", "POST", body, { chave: chave(), ...op })
    let principal, detalhe
    await t.test(
      "01 cria dois itens do mesmo produto com variações distintas e total 259.50",
      async () => {
        principal = await crear()
        assert.equal(principal.status, 201)
        assert.equal(principal.body.criado, true)
        detalhe = (await chamar(`/api/pedidos/${principal.body.idPedido}`)).body
        assert.equal(detalhe.total, "259.50")
        assert.deepEqual(
          detalhe.itens.map((i) => i.subtotal),
          ["149.70", "109.80"],
        )
        assert.equal(detalhe.status, "RASCUNHO")
        assert.equal(detalhe.itens[0].quantidade, "3.000")
        assert.equal(detalhe.dataEntregaPrevista, "2026-11-15")
        assert.equal(detalhe.itens[0].idCor, corA.id)
      },
    )
    assert.ok(
      principal?.body.idPedido,
      "A criação inicial deve funcionar antes dos demais cenários.",
    )
    const id = principal.body.idPedido
    await t.test("02 produto sem grade, um item, preço explícito", async () => {
      const r = await crear(corpo())
      assert.equal(r.status, 201)
      const d = (await chamar(`/api/pedidos/${r.body.idPedido}`)).body
      assert.equal(d.total, "10.00")
      assert.equal(d.itens[0].idVariacao, null)
    })
    await t.test(
      "03 repetição da combinação produto/variação e sem grade é rejeitada",
      async () => {
        for (const i of [novoItem, corpo().itens[0]])
          assert.equal((await crear(corpo([i, i]))).status, 400)
      },
    )
    await t.test(
      "04 item legado mantém descrição, cor/tamanho e variação nula",
      async () => {
        const r = await chamar(`/api/pedidos/${legado.id}`)
        assert.equal(r.status, 200)
        assert.equal(r.body.itens[0].idVariacao, null)
        assert.equal(r.body.itens[0].descricao, "Descrição legada")
        assert.equal(r.body.itens[0].idCor, corA.id)
      },
    )
    await t.test(
      "05 variação de outro produto/empresa e cadastro alheio não vazam",
      async () => {
        for (const variacao of [varB.id, varOutro.id, 2147483647]) {
          const r = await crear(corpo([{ ...novoItem, idVariacao: variacao }]))
          assert.equal(r.status, 404)
          assert.deepEqual(r.body, { error: "Cadastro não encontrado." })
        }
        assert.equal(
          (await crear(corpo([{ ...novoItem, idProduto: produtos[5] }])))
            .status,
          404,
        )
        assert.equal(
          (await crear({ ...pedido, idCliente: clientes[1].id })).status,
          404,
        )
      },
    )
    await t.test(
      "06 cliente/produto/habilitação inativos ou produto sem venda",
      async () => {
        assert.equal(
          (await crear({ ...pedido, idCliente: clienteInativo.id })).status,
          409,
        )
        for (const p of [produtos[2], produtos[3], produtos[4]])
          assert.equal(
            (
              await crear(
                corpo([
                  { idProduto: p, quantidade: "1.000", precoPraticado: "1.00" },
                ]),
              )
            ).status,
            409,
          )
      },
    )
    await t.test(
      "07 grade exige variação; variação inativa é rejeitada",
      async () => {
        assert.equal(
          (await crear(corpo([{ ...novoItem, idVariacao: null }]))).status,
          409,
        )
        await prisma.produto_variacoes.update({
          where: { id: variacoes[0].id },
          data: { status: "INATIVO" },
        })
        try {
          assert.equal((await crear()).status, 409)
        } finally {
          await prisma.produto_variacoes.update({
            where: { id: variacoes[0].id },
            data: { status: "ATIVO" },
          })
        }
      },
    )
    await t.test(
      "08 cor/tamanho inativos ou inconsistentes com empresa",
      async () => {
        await prisma.cores.update({
          where: { id: corA.id },
          data: { status: "INATIVA" },
        })
        try {
          assert.equal((await crear()).status, 409)
        } finally {
          await prisma.cores.update({
            where: { id: corA.id },
            data: { status: "ATIVA" },
          })
        }
        await prisma.produto_variacoes.update({
          where: { id: variacoes[0].id },
          data: { id_cor: corB.id },
        })
        try {
          assert.equal((await crear()).status, 404)
        } finally {
          await prisma.produto_variacoes.update({
            where: { id: variacoes[0].id },
            data: { id_cor: corA.id },
          })
        }
      },
    )
    await t.test(
      "09 rejeita totais, status, empresa, número e campos extras",
      async () => {
        for (const campo of [
          "total",
          "valorTotal",
          "subtotal",
          "idEmpresa",
          "idUsuario",
          "numero",
          "status",
          "fechadoEm",
        ])
          assert.equal((await crear({ ...pedido, [campo]: 1 })).status, 400)
        for (const campo of ["subtotal", "valor_total", "total", "idCor"])
          assert.equal(
            (await crear(corpo([{ ...novoItem, [campo]: 1 }]))).status,
            400,
          )
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}`,
              "PATCH",
              { status: "CONCLUIDO" },
              { versao: 1 },
            )
          ).status,
          400,
        )
      },
    )
    await t.test(
      "10 quantidade/preço inválidos e precisão excedente retornam 400",
      async () => {
        for (const quantidade of ["0", "-1", "1.0001", "1,2", " 1", 1])
          assert.equal(
            (await crear(corpo([{ ...novoItem, quantidade }]))).status,
            400,
          )
        for (const precoPraticado of ["-1", "1.001", 1])
          assert.equal(
            (await crear(corpo([{ ...novoItem, precoPraticado }]))).status,
            400,
          )
      },
    )
    await t.test(
      "11 HALF_UP em quantidade fracionária e subtotal antes da soma",
      async () => {
        const r = await crear(
          corpo([
            { ...novoItem, quantidade: "0.125", precoPraticado: "0.12" },
            {
              ...novoItem,
              idVariacao: variacoes[1].id,
              quantidade: "0.125",
              precoPraticado: "0.12",
            },
          ]),
        )
        assert.equal(r.status, 201)
        const d = (await chamar(`/api/pedidos/${r.body.idPedido}`)).body
        assert.equal(d.total, "0.04")
        assert.equal(d.itens[0].quantidade, "0.125")
        assert.equal(d.itens[0].subtotal, "0.02")
      },
    )
    await t.test(
      "12 overflow de subtotal e soma não deixam pedido parcial",
      async () => {
        const before = await prisma.pedido_cliente.count()
        const a = {
          ...novoItem,
          quantidade: "999999999999.999",
          precoPraticado: "9999999999999.99",
        }
        assert.equal((await crear(corpo([a]))).status, 409)
        assert.equal(
          (
            await crear(
              corpo([
                {
                  ...novoItem,
                  quantidade: "1.000",
                  precoPraticado: "9999999999999.99",
                },
                {
                  ...novoItem,
                  idVariacao: variacoes[1].id,
                  quantidade: "1.000",
                  precoPraticado: "0.01",
                },
              ]),
            )
          ).status,
          409,
        )
        assert.equal(await prisma.pedido_cliente.count(), before)
      },
    )
    await t.test(
      "13 idempotência persistida: repetição não altera pedido/auditoria/numeração",
      async () => {
        const k = chave(),
          a = await crear(pedido, { chave: k })
        const before = await prisma.sequencias_automaticas.findUnique({
          where: {
            id_empresa_entidade: {
              id_empresa: empresas[0],
              entidade: "pedido_cliente",
            },
          },
        })
        const b = await crear(pedido, { chave: k })
        assert.equal(b.status, 200)
        assert.equal(b.body.criado, false)
        assert.equal(a.body.idPedido, b.body.idPedido)
        assert.equal(
          await prisma.auditoria.count({
            where: {
              tabela: "pedido_cliente",
              id_registro: a.body.idPedido,
              acao: "INSERT",
            },
          }),
          1,
        )
        const after = await prisma.sequencias_automaticas.findUnique({
          where: {
            id_empresa_entidade: {
              id_empresa: empresas[0],
              entidade: "pedido_cliente",
            },
          },
        })
        assert.equal(before.ultimo_numero, after.ultimo_numero)
        assert.equal(
          (
            await crear(
              { ...pedido, dataEntregaPrevista: "2026-11-16" },
              { chave: k },
            )
          ).status,
          409,
        )
      },
    )
    await t.test(
      "14 duas criações concorrentes com mesma chave: um pedido",
      async () => {
        const k = chave(),
          rs = await Promise.all([
            crear(pedido, { chave: k }),
            crear(pedido, { chave: k }),
          ])
        assert.deepEqual(rs.map((r) => r.status).sort(), [200, 201])
        assert.equal(rs[0].body.idPedido, rs[1].body.idPedido)
        assert.equal(
          await prisma.pedido_cliente.count({
            where: { id_empresa: empresas[0], chave_idempotencia: k },
          }),
          1,
        )
      },
    )
    await t.test(
      "15 numeração concorrente é única e não usa count",
      async () => {
        const rs = await Promise.all(
          Array.from({ length: 5 }, () => crear(corpo())),
        )
        assert.ok(rs.every((r) => r.status === 201))
        assert.equal(new Set(rs.map((r) => r.body.numero)).size, 5)
      },
    )
    await t.test(
      "16 inclusão, edição e remoção recalculam na mesma transação",
      async () => {
        const a = await chamar(
          `/api/pedidos/${id}/itens`,
          "POST",
          corpo().itens[0],
          { versao: 1 },
        )
        assert.equal(a.status, 201)
        let d = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(d.total, "269.50")
        assert.equal(d.versao, 2)
        const b = await chamar(
          `/api/pedidos/${id}/itens/${a.body.idItem}`,
          "PATCH",
          { quantidade: "2.000", precoPraticado: "7.25" },
          { versao: 2 },
        )
        assert.equal(b.status, 200)
        d = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(d.total, "274.00")
        assert.equal(d.versao, 3)
        const c = await chamar(
          `/api/pedidos/${id}/itens/${a.body.idItem}`,
          "DELETE",
          undefined,
          { versao: 3 },
        )
        assert.equal(c.status, 200)
        d = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(d.total, "259.50")
        assert.equal(d.versao, 4)
      },
    )
    await t.test("17 remoção do último item é proibida", async () => {
      const d = (await chamar(`/api/pedidos/${legado.id}`)).body
      assert.equal(
        (
          await chamar(
            `/api/pedidos/${legado.id}/itens/${d.itens[0].idItem}`,
            "DELETE",
            undefined,
            { versao: 1 },
          )
        ).status,
        409,
      )
    })
    await t.test(
      "18 duas edições da mesma versão: sucesso único e total consistente",
      async () => {
        const d = (await chamar(`/api/pedidos/${id}`)).body
        const rs = await Promise.all(
          ["4.000", "5.000"].map((quantidade) =>
            chamar(
              `/api/pedidos/${id}/itens/${d.itens[0].idItem}`,
              "PATCH",
              { quantidade },
              { versao: d.versao },
            ),
          ),
        )
        assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409])
        const after = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(after.versao, d.versao + 1)
        assert.equal(
          after.total,
          after.itens
            .reduce((s, i) => s.plus(i.subtotal), new Prisma.Decimal(0))
            .toFixed(2),
        )
      },
    )
    await t.test(
      "19 duplicidade sem variação sob concorrência não depende de NULL unique",
      async () => {
        const c = await crear(corpo([{ ...novoItem }])),
          p = c.body.idPedido
        const rs = await Promise.all(
          [1, 2].map(() =>
            chamar(`/api/pedidos/${p}/itens`, "POST", corpo().itens[0], {
              versao: 1,
            }),
          ),
        )
        assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409])
        assert.equal(
          (
            await chamar(`/api/pedidos/${p}/itens`, "POST", corpo().itens[0], {
              versao: 2,
            })
          ).status,
          409,
        )
        assert.equal(
          await prisma.pedido_cliente_item.count({
            where: {
              id_pedido_cliente: p,
              id_produto: produtos[1],
              id_variacao: null,
            },
          }),
          1,
        )
      },
    )
    await t.test(
      "20 prazo/cliente/observação de rascunho; versão obrigatória",
      async () => {
        const d = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(
          (
            await chamar(`/api/pedidos/${id}`, "PATCH", {
              observacao: "Sem versão",
            })
          ).status,
          400,
        )
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}`,
              "PATCH",
              { dataEntregaPrevista: "2026-02-29" },
              { versao: d.versao },
            )
          ).status,
          400,
        )
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}`,
              "PATCH",
              {
                observacao: "Atualizado",
                dataEntregaPrevista: "2026-12-01",
                idCliente: clientes[0].id,
              },
              { versao: d.versao },
            )
          ).status,
          200,
        )
        const after = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(after.dataEntregaPrevista, "2026-12-01")
        assert.equal(after.observacao, "Atualizado")
      },
    )
    await t.test(
      "21 pedido não rascunho bloqueia todas as mutações comuns",
      async () => {
        const c = await crear(),
          p = c.body.idPedido,
          d = (await chamar(`/api/pedidos/${p}`)).body
        await prisma.pedido_cliente.update({
          where: { id: p },
          data: { status: "CONFIRMADO" },
        })
        for (const [rota, metodo, b] of [
          [`/api/pedidos/${p}`, "PATCH", { observacao: "Tentativa" }],
          [`/api/pedidos/${p}/itens`, "POST", corpo().itens[0]],
          [
            `/api/pedidos/${p}/itens/${d.itens[0].idItem}`,
            "PATCH",
            { quantidade: "1.000" },
          ],
          [`/api/pedidos/${p}/itens/${d.itens[0].idItem}`, "DELETE", undefined],
        ])
          assert.equal(
            (await chamar(rota, metodo, b, { versao: 1 })).status,
            409,
          )
      },
    )
    await t.test(
      "22 preço e descrição históricos não mudam com catálogo",
      async () => {
        const before = (await chamar(`/api/pedidos/${id}`)).body
        await prisma.produto_empresa.update({
          where: {
            id_empresa_id_produto: {
              id_empresa: empresas[0],
              id_produto: produtos[0],
            },
          },
          data: { preco_venda: "1.00" },
        })
        await prisma.produtos.update({
          where: { id: produtos[0] },
          data: { nome: "Nome alterado no catálogo" },
        })
        const after = (await chamar(`/api/pedidos/${id}`)).body
        assert.deepEqual(after.itens, before.itens)
        assert.equal(after.total, before.total)
      },
    )
    await t.test(
      "23 item de outro pedido e recurso alheio retornam ausência genérica",
      async () => {
        const d = (await chamar(`/api/pedidos/${id}`)).body,
          l = (await chamar(`/api/pedidos/${legado.id}`)).body
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}/itens/${l.itens[0].idItem}`,
              "PATCH",
              { quantidade: "1.000" },
              { versao: d.versao },
            )
          ).status,
          404,
        )
        const a = await chamar(`/api/pedidos/${estrangeiro.id}`),
          b = await chamar("/api/pedidos/2147483647")
        assert.equal(a.status, 404)
        assert.deepEqual(a, b)
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${estrangeiro.id}`,
              "PATCH",
              { observacao: "Tentativa" },
              { versao: 1 },
            )
          ).status,
          404,
        )
      },
    )
    await t.test(
      "24 listagem pagina no banco, filtros estáveis e contagem da empresa",
      async () => {
        const count = await prisma.pedido_cliente.count({
          where: { id_empresa: empresas[0] },
        })
        const a = await chamar("/api/pedidos?limite=2&pagina=1"),
          b = await chamar("/api/pedidos?limite=2&pagina=2")
        assert.equal(a.status, 200)
        assert.equal(a.body.paginacao.totalRegistros, count)
        assert.equal(a.body.dados.length, 2)
        assert.ok(
          a.body.dados.every(
            (x) => !b.body.dados.some((y) => y.idPedido === x.idPedido),
          ),
        )
        assert.ok(!a.body.dados.some((x) => x.idPedido === estrangeiro.id))
        assert.equal(
          (await chamar(`/api/pedidos?idCliente=${clientes[1].id}`)).body
            .paginacao.totalRegistros,
          0,
        )
        assert.equal(
          (await chamar("/api/pedidos?busca=OUTRA-EMPRESA")).body.paginacao
            .totalRegistros,
          0,
        )
        assert.equal(
          (await chamar("/api/pedidos?status=CONFIRMADO")).body.paginacao
            .totalRegistros,
          1,
        )
        assert.equal(
          (await chamar("/api/pedidos?pagina=2147483647")).body.dados.length,
          0,
        )
      },
    )
    await t.test(
      "25 filtros inválidos, repetidos, desconhecidos e maliciosos",
      async () => {
        for (const q of [
          "limite=101",
          "pagina=0",
          "pagina=1&pagina=2",
          "id_empresa=1",
          "status=FATURADA",
          "idCliente=1e2",
          "dataInicio=2026-12-01&dataFim=2026-11-01",
        ])
          assert.equal((await chamar("/api/pedidos?" + q)).status, 400, q)
        // Next normaliza a URL antes do handler e remove __proto__. Não é filtro
        // aceito: deve produzir exatamente a mesma consulta AUTORIZADA sem filtro.
        const semFiltro = await chamar("/api/pedidos")
        const normalizado = await chamar("/api/pedidos?__proto__=1")
        assert.equal(normalizado.status, 200)
        assert.deepEqual(normalizado.body, semFiltro.body)
        assert.equal(
          (await chamar("/api/pedidos?busca=%27%20OR%201%3D1--")).body.paginacao
            .totalRegistros,
          0,
        )
        assert.equal((await chamar("/api/pedidos/01")).status, 400)
      },
    )
    await t.test(
      "26 JWT inválido e empresa pelo header não concedem acesso",
      async () => {
        for (const token of ["", "invalido"])
          assert.equal(
            (await chamar("/api/pedidos", "GET", undefined, { token })).status,
            401,
          )
        assert.equal(
          (
            await chamar("/api/pedidos", "GET", undefined, {
              empresa: empresas[1],
            })
          ).status,
          403,
        )
      },
    )
    await t.test(
      "27 permissões comerciais independentes e outras permissões negadas",
      async () => {
        assert.equal(
          (await chamar("/api/pedidos", "GET", undefined, { usuario: 1 }))
            .status,
          200,
        )
        assert.equal((await crear(pedido, { usuario: 1 })).status, 403)
        const c = await crear(corpo(), { usuario: 2 })
        assert.equal(c.status, 201)
        assert.equal("total" in c.body, false)
        assert.equal("itens" in c.body, false)
        assert.equal(
          (await chamar("/api/pedidos", "GET", undefined, { usuario: 2 }))
            .status,
          403,
        )
        assert.equal((await crear(pedido, { usuario: 3 })).status, 403)
        assert.equal(
          (await chamar("/api/pedidos", "GET", undefined, { usuario: 5 }))
            .status,
          403,
        )
        const d = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}/itens/${d.itens[0].idItem}`,
              "DELETE",
              undefined,
              { usuario: 4, versao: d.versao },
            )
          ).status,
          403,
        )
      },
    )
    await t.test(
      "28 usuário, vínculo e empresa ativos revalidados, inclusive admin",
      async () => {
        await prisma.usuarios.update({
          where: { id: usuarios[0] },
          data: { status: "INATIVO" },
        })
        try {
          assert.equal((await chamar("/api/pedidos")).status, 403)
        } finally {
          await prisma.usuarios.update({
            where: { id: usuarios[0] },
            data: { status: "ATIVO" },
          })
        }
        await prisma.usuario_empresa.update({
          where: { id: vinculos[0].id },
          data: { status: "INATIVO" },
        })
        try {
          assert.equal((await chamar("/api/pedidos")).status, 403)
        } finally {
          await prisma.usuario_empresa.update({
            where: { id: vinculos[0].id },
            data: { status: "ATIVO" },
          })
        }
        await prisma.empresas.update({
          where: { id: empresas[0] },
          data: { status: "INATIVA" },
        })
        try {
          assert.equal((await chamar("/api/pedidos")).status, 403)
        } finally {
          await prisma.empresas.update({
            where: { id: empresas[0] },
            data: { status: "ATIVA" },
          })
        }
      },
    )
    await t.test(
      "29 histórico de clientes continua consultando vendas legadas",
      async () => {
        const response = await fetch(
          http.base + `/api/clientes/${clientes[0].id}/pedidos`,
          {
            headers: {
              Authorization: `Bearer ${tokens[0]}`,
              "X-Empresa-Id": String(empresas[0]),
            },
          },
        )
        assert.equal(response.status, 200)
        const data = await response.json()
        assert.equal(data.paginacao.total, 1)
        assert.equal(data.pedidos[0].id, venda.id)
        assert.equal(data.pedidos[0].valor_total, "15.00")
      },
    )
    await t.test(
      "30 auditoria grava agregado; falha real de FK reverte edição/total/versão",
      async () => {
        assert.equal(
          await prisma.auditoria.count({
            where: {
              tabela: "pedido_cliente",
              id_registro: id,
              acao: "INSERT",
            },
          }),
          1,
        )
        const before = await services.consultarPedido(
          { idEmpresa: empresas[0], idUsuario: usuarios[0] },
          id,
        )
        await assert.rejects(
          services.editarItem(
            { idEmpresa: empresas[0], idUsuario: 2147483647 },
            id,
            before.itens[0].idItem,
            before.versao,
            { quantidade: "9.000" },
          ),
        )
        const after = await services.consultarPedido(
          { idEmpresa: empresas[0], idUsuario: usuarios[0] },
          id,
        )
        assert.deepEqual(after, before)
      },
    )
    await t.test(
      "31 falha de item/auditoria na transação não deixa cabeçalho ou número",
      async () => {
        const before = await prisma.pedido_cliente.count(),
          ctx = { idEmpresa: empresas[0], idUsuario: usuarios[0] }
        const seqBefore = await prisma.sequencias_automaticas.findUnique({
          where: {
            id_empresa_entidade: {
              id_empresa: empresas[0],
              entidade: "pedido_cliente",
            },
          },
        })
        for (const falha of ["item", "auditoria"])
          await assert.rejects(
            repo.gravacao(async (tx) => {
              await repo.bloquearEmpresa(tx, ctx.idEmpresa)
              const numero = await repo.proximoNumero(tx, ctx.idEmpresa)
              const p = await tx.pedido_cliente.create({
                data: {
                  id_empresa: ctx.idEmpresa,
                  id_usuario: ctx.idUsuario,
                  id_cliente: clientes[0].id,
                  numero,
                },
              })
              await tx.pedido_cliente_item.create({
                data: {
                  id_pedido_cliente: p.id,
                  numero_item: 1,
                  id_produto: falha === "item" ? 2147483647 : produtos[1],
                  descricao: "Rollback",
                  unidade: "UN",
                  quantidade: "1.000",
                  valor_unitario: "1.00",
                  valor_total: "1.00",
                },
              })
              await repo.auditar(
                tx,
                { ...ctx, idUsuario: 2147483647 },
                null,
                await repo.buscarPedido(tx, ctx, p.id),
              )
            }),
          )
        assert.equal(await prisma.pedido_cliente.count(), before)
        const seqAfter = await prisma.sequencias_automaticas.findUnique({
          where: {
            id_empresa_entidade: {
              id_empresa: empresas[0],
              entidade: "pedido_cliente",
            },
          },
        })
        assert.equal(seqBefore.ultimo_numero, seqAfter.ultimo_numero)
      },
    )
    await t.test(
      "32 GETs não alteram dados; nenhuma venda/cobrança/reserva/movimentação/produção nova",
      async () => {
        const before = await prisma.pedido_cliente.findUnique({
            where: { id },
          }),
          items = await prisma.pedido_cliente_item.findMany({
            where: { id_pedido_cliente: id },
            orderBy: { id: "asc" },
          })
        await chamar(`/api/pedidos/${id}`)
        await chamar("/api/pedidos")
        assert.deepEqual(
          await prisma.pedido_cliente.findUnique({ where: { id } }),
          before,
        )
        assert.deepEqual(
          await prisma.pedido_cliente_item.findMany({
            where: { id_pedido_cliente: id },
            orderBy: { id: "asc" },
          }),
          items,
        )
        assert.deepEqual(
          {
            venda: await prisma.venda.count(),
            contas: await prisma.contas_receber.count(),
            reservas: await prisma.reserva_estoque.count(),
            movimentos: await prisma.movimentacao_estoque.count(),
            ordens: await prisma.ordem_producao.count(),
          },
          inicial,
        )
      },
    )
    await t.test(
      "33 idempotência é da empresa, exige mesmo autor e normaliza escalas",
      async () => {
        const k = chave(),
          a = await crear(pedido, { chave: k })
        assert.equal(a.status, 201)
        const normalizado = {
          ...pedido,
          itens: pedido.itens.map((i) => ({
            ...i,
            quantidade: i.quantidade.replace(/\.000$/, ""),
          })),
        }
        const repetido = await crear(normalizado, { chave: k })
        assert.equal(repetido.status, 200)
        assert.equal(repetido.body.idPedido, a.body.idPedido)
        assert.equal(
          (await crear(pedido, { chave: k, usuario: 2 })).status,
          409,
        )
        const b = await crear(
          {
            ...pedido,
            idCliente: clientes[1].id,
            itens: [
              {
                idProduto: produtos[5],
                quantidade: "1.000",
                precoPraticado: "1.00",
              },
            ],
          },
          { chave: k, usuario: 6, empresa: empresas[1] },
        )
        assert.equal(b.status, 201)
        assert.notEqual(b.body.idPedido, a.body.idPedido)
      },
    )
    await t.test(
      "34 edição após mudança do catálogo conserva preço/descrição históricos",
      async () => {
        const before = (await chamar(`/api/pedidos/${id}`)).body
        const item = before.itens[0]
        assert.equal(
          (
            await chamar(
              `/api/pedidos/${id}/itens/${item.idItem}`,
              "PATCH",
              { quantidade: item.quantidade },
              { versao: before.versao },
            )
          ).status,
          200,
        )
        const after = (await chamar(`/api/pedidos/${id}`)).body
        assert.equal(after.itens[0].descricao, item.descricao)
        assert.equal(after.itens[0].precoPraticado, item.precoPraticado)
        assert.equal(after.total, before.total)
      },
    )
    await t.test(
      "35 cliente inativado bloqueia mutações, mantendo consulta/repetição segura",
      async () => {
        const k = chave(),
          c = await crear(pedido, { chave: k }),
          d = (await chamar(`/api/pedidos/${c.body.idPedido}`)).body,
          p = c.body.idPedido
        await prisma.clientes.update({
          where: { id: clientes[0].id },
          data: { status: "INATIVO" },
        })
        try {
          assert.equal((await chamar(`/api/pedidos/${p}`)).status, 200)
          assert.equal((await crear(pedido, { chave: k })).status, 200)
          for (const [rota, metodo, b] of [
            [`/api/pedidos/${p}`, "PATCH", { observacao: "Mudança" }],
            [`/api/pedidos/${p}/itens`, "POST", corpo().itens[0]],
            [
              `/api/pedidos/${p}/itens/${d.itens[0].idItem}`,
              "PATCH",
              { quantidade: "1.000" },
            ],
            [
              `/api/pedidos/${p}/itens/${d.itens[0].idItem}`,
              "DELETE",
              undefined,
            ],
          ])
            assert.equal(
              (await chamar(rota, metodo, b, { versao: d.versao })).status,
              409,
            )
        } finally {
          await prisma.clientes.update({
            where: { id: clientes[0].id },
            data: { status: "ATIVO" },
          })
        }
      },
    )
  } finally {
    if (server?.exitCode === null) {
      const exited = once(server, "exit")
      server.kill()
      await exited
    }
    if (prisma) {
      if (empresas.length) {
        const escopo = { in: empresas }
        await prisma.auditoria.deleteMany({
          where: {
            OR: [{ id_empresa: escopo }, { id_usuario: { in: usuarios } }],
          },
        })
        await prisma.refresh_tokens.deleteMany({
          where: { id_usuario: { in: usuarios } },
        })
        await prisma.venda.deleteMany({ where: { id_empresa: escopo } })
        await prisma.pedido_cliente_historico.deleteMany({
          where: { pedido_cliente: { id_empresa: escopo } },
        })
        await prisma.pedido_cliente_item.deleteMany({
          where: { pedido_cliente: { id_empresa: escopo } },
        })
        await prisma.pedido_cliente.deleteMany({
          where: { id_empresa: escopo },
        })
        await prisma.produto_variacoes.deleteMany({
          where: { id_empresa: escopo },
        })
        await prisma.produto_empresa.deleteMany({
          where: { id_empresa: escopo },
        })
        await prisma.cores.deleteMany({ where: { id_empresa: escopo } })
        await prisma.tamanhos.deleteMany({ where: { id_empresa: escopo } })
        await prisma.clientes.deleteMany({ where: { id_empresa: escopo } })
        await prisma.sequencias_automaticas.deleteMany({
          where: { id_empresa: escopo },
        })
        await prisma.usuario_empresa.deleteMany({
          where: { id_empresa: escopo },
        })
        await prisma.cargos.deleteMany({ where: { id_empresa: escopo } })
        await prisma.empresas.deleteMany({ where: { id: escopo } })
      }
      await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
      await prisma.tipos_produto.deleteMany({ where: { id: { in: tipos } } })
      await prisma.$disconnect()
    }
    hooks.deregister()
  }
})
