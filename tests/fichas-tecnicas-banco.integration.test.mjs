import assert from "node:assert/strict"
import { test } from "node:test"
import { randomBytes } from "node:crypto"
import mariadb from "mariadb"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"
import { tokenDeSessao } from "./helpers/sessao-integracao.mjs"

// Banco local dedicado com o schema atual. Não altera o schema nem usa dados reais.
// FICHAS_TEST_DATABASE_URL=mysql://.../fichas_test node --test --test-force-exit tests/fichas-tecnicas-banco.integration.test.mjs
test("ficha técnica ativa, HTTP e transações em MySQL", async (t) => {
  const url = bancoLocal(process.env.FICHAS_TEST_DATABASE_URL)
  process.env.DATABASE_URL = url.href
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const { GET, PUT } =
    await import("../src/app/api/fichas-tecnicas/ativa/route.ts")
  const { abrirOrdem } =
    await import("../src/modules/producao/producao.service.ts")
  const sql = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  })
  try {
    assert.equal(
      await prisma.empresas.count(),
      0,
      "Use um banco de testes dedicado vazio.",
    )
    const empresa = await prisma.empresas.create({
      data: { razao_social: "Fichas teste", cnpj: "99000000000111" },
    })
    const outra = await prisma.empresas.create({
      data: { razao_social: "Outra empresa", cnpj: "99000000000222" },
    })
    const usuario = await prisma.usuarios.create({
      data: {
        nome: "Fixture",
        email: "fichas@example.test",
        senha: "sem-login",
        nivel_acesso: "ADMIN",
      },
    })
    const cargo = await prisma.cargos.create({
      data: { id_empresa: empresa.id, nome: "Produção" },
    })
    await prisma.usuario_empresa.create({
      data: {
        id_empresa: empresa.id,
        id_usuario: usuario.id,
        id_cargo: cargo.id,
      },
    })
    const token = await tokenDeSessao(prisma, usuario.id, "ADMINISTRACAO")
    const tipo = await prisma.tipos_produto.create({
      data: { nome: "Produto teste" },
    })
    const produto = async (codigo, idEmpresa = empresa.id, producao = false) =>
      prisma.produtos.create({
        data: {
          nome: codigo,
          codigo,
          id_tipo_produto: tipo.id,
          controla_estoque: true,
          permite_producao: producao,
          permite_compra: !producao,
          produto_empresa: { create: { id_empresa: idEmpresa } },
        },
      })
    const acabado = await produto("ACABADO", empresa.id, true)
    const insumo = await produto("INSUMO")
    const alheio = await produto("ALHEIO", outra.id)
    const contexto = { idUsuario: usuario.id, idEmpresa: empresa.id }
    const corpo = (idFicha, quantidade = "2.000", idProduto = acabado.id) => ({
      id_produto: idProduto,
      id_ficha_esperada: idFicha,
      itens: [{ id_produto_componente: insumo.id, quantidade }],
    })
    const chamar = async (method, body, options = {}) => {
      const headers = {
        "X-Empresa-Id": String(options.empresa ?? empresa.id),
        "Content-Type": "application/json",
      }
      if (options.token !== null)
        headers.Authorization = `Bearer ${options.token ?? token}`
      const query =
        method === "GET" ? `?id_produto=${options.produto ?? acabado.id}` : ""
      return (method === "GET" ? GET : PUT)(
        new Request("http://localhost/api/fichas-tecnicas/ativa" + query, {
          method,
          headers,
          body: method === "PUT" ? JSON.stringify(body) : undefined,
        }),
      )
    }
    let atual
    await t.test(
      "contrato null, primeira versão e igualdade da composição",
      async () => {
        assert.equal((await chamar("GET", null, { token: null })).status, 401)
        assert.equal(
          (await chamar("PUT", corpo(null), { empresa: outra.id })).status,
          403,
        )
        assert.equal(
          (await chamar("GET", null, { produto: alheio.id })).status,
          404,
        )
        assert.equal(
          (await chamar("PUT", corpo(null, "1", alheio.id))).status,
          404,
        )
        assert.deepEqual(await (await chamar("GET")).json(), {
          success: true,
          data: null,
        })
        const res = await chamar("PUT", corpo(null))
        assert.equal(res.status, 200)
        atual = (await res.json()).data
        assert.equal(atual.versao, 1)
        assert.deepEqual(atual.itens, corpo(null).itens)
        const igual = await chamar("PUT", corpo(atual.id, "2"))
        assert.equal((await igual.json()).data.id, atual.id)
        assert.equal(
          await prisma.ficha_tecnica.count({
            where: { id_produto: acabado.id },
          }),
          1,
        )
        assert.deepEqual(await (await chamar("GET")).json(), {
          success: true,
          data: atual,
        })
      },
    )

    await t.test(
      "OP existente preserva o consumo; nova OP usa a nova ficha",
      async () => {
        const setor = await prisma.setores.create({
          data: { id_empresa: empresa.id, nome: "Corte" },
        })
        const local = await prisma.locais_estoque.create({
          data: { id_empresa: empresa.id, nome: "Fábrica" },
        })
        await prisma.estoque.create({
          data: {
            id_empresa: empresa.id,
            id_local_estoque: local.id,
            id_setor: setor.id,
            id_produto: insumo.id,
            quantidade: "100",
          },
        })
        const fluxo = await prisma.fluxos_producao.create({
          data: {
            id_empresa: empresa.id,
            nome: "Fluxo",
            fluxo_producao_setor: { create: { id_setor: setor.id, ordem: 1 } },
          },
        })
        await prisma.produto_fluxo.create({
          data: {
            id_empresa: empresa.id,
            id_produto: acabado.id,
            id_fluxo: fluxo.id,
          },
        })
        const abrir = () =>
          abrirOrdem(contexto, {
            idProduto: acabado.id,
            quantidade: "3",
            tamanho: "UNICO",
          })
        const op = await abrir()
        const consumo = () =>
          prisma.ordem_producao_consumo_planejado.findMany({
            where: { id_ordem_producao: op.ordem.id },
          })
        const antes = await consumo()
        assert.equal(antes[0].quantidade_necessaria.toFixed(3), "6.000")
        const res = await chamar("PUT", corpo(atual.id, "0.350"))
        assert.equal(res.status, 200)
        const anterior = atual
        atual = (await res.json()).data
        assert.equal(atual.versao, 2)
        assert.equal(
          (
            await prisma.ficha_tecnica.findUniqueOrThrow({
              where: { id: anterior.id },
            })
          ).status,
          "INATIVA",
        )
        assert.deepEqual(await consumo(), antes)
        const novaOp = await abrir()
        const novoConsumo =
          await prisma.ordem_producao_consumo_planejado.findFirstOrThrow({
            where: { id_ordem_producao: novaOp.ordem.id },
          })
        assert.equal(novoConsumo.quantidade_necessaria.toFixed(3), "1.050")
        assert.equal(
          (
            await prisma.ficha_tecnica_item.findFirstOrThrow({
              where: { id_ficha_tecnica: atual.id },
            })
          ).perda_percentual.toFixed(2),
          "0.00",
        )
      },
    )

    await t.test(
      "edições simultâneas têm um vencedor e devolvem conflito para o outro",
      async () => {
        const respostas = await Promise.all([
          chamar("PUT", corpo(atual.id, "1")),
          chamar("PUT", corpo(atual.id, "3")),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409])
        atual = (await respostas.find((r) => r.status === 200).json()).data
        assert.equal(
          await prisma.ficha_tecnica.count({
            where: {
              id_empresa: empresa.id,
              id_produto: acabado.id,
              status: "ATIVA",
            },
          }),
          1,
        )
        assert.equal(atual.versao, 3)
      },
    )

    await t.test(
      "criação simultânea com id esperado null também é serializada",
      async () => {
        const outro = await produto("NOVA-FICHA", empresa.id, true)
        const respostas = await Promise.all([
          chamar("PUT", corpo(null, "1", outro.id)),
          chamar("PUT", corpo(null, "2", outro.id)),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409])
        assert.equal(
          await prisma.ficha_tecnica.count({ where: { id_produto: outro.id } }),
          1,
        )
      },
    )

    await t.test(
      "componentes fora da empresa, inativos ou sem estoque são rejeitados",
      async () => {
        const body = corpo(atual.id)
        body.itens[0].id_produto_componente = alheio.id
        assert.equal((await chamar("PUT", body)).status, 400)
        await prisma.produto_empresa.update({
          where: {
            id_empresa_id_produto: {
              id_empresa: empresa.id,
              id_produto: insumo.id,
            },
          },
          data: { status: "INATIVO" },
        })
        assert.equal((await chamar("PUT", corpo(atual.id))).status, 400)
        await prisma.produto_empresa.update({
          where: {
            id_empresa_id_produto: {
              id_empresa: empresa.id,
              id_produto: insumo.id,
            },
          },
          data: { status: "ATIVO" },
        })
        await prisma.produtos.update({
          where: { id: insumo.id },
          data: { controla_estoque: false },
        })
        assert.equal((await chamar("PUT", corpo(atual.id))).status, 400)
        await prisma.produtos.update({
          where: { id: insumo.id },
          data: { controla_estoque: true },
        })
      },
    )

    await t.test("leitura não concede edição ao usuário comum", async () => {
      const leitor = await prisma.usuarios.create({
        data: {
          nome: "Leitor",
          email: "leitor-fichas@example.test",
          senha: "sem-login",
        },
      })
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_empresa: empresa.id,
          id_usuario: leitor.id,
          id_cargo: cargo.id,
        },
      })
      await prisma.permissoes_usuario.create({
        data: {
          id_usuario_empresa: vinculo.id,
          recurso: "PRODUTOS",
          pode_ler: true,
        },
      })
      const acesso = await tokenDeSessao(prisma, leitor.id, "PRODUCAO")
      assert.equal((await chamar("GET", null, { token: acesso })).status, 200)
      assert.equal(
        (await chamar("PUT", corpo(atual.id), { token: acesso })).status,
        403,
      )
    })

    for (const tabela of ["ficha_tecnica_item", "auditoria"]) {
      await t.test(
        `falha em ${tabela} reverte a inativação e a nova versão`,
        async () => {
          await sql.query(
            `CREATE TRIGGER teste_falha_ficha BEFORE INSERT ON ${tabela} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha de teste'`,
          )
          try {
            const antes = await prisma.ficha_tecnica.count({
              where: { id_produto: acabado.id },
            })
            // A exceção é observada pelo service, sem publicar detalhes do SQL.
            const { salvarAtiva } =
              await import("../modules/fichas-tecnicas/service.ts")
            await assert.rejects(
              salvarAtiva(contexto, corpo(atual.id, "0.250")),
            )
            assert.equal(
              await prisma.ficha_tecnica.count({
                where: { id_produto: acabado.id },
              }),
              antes,
            )
            assert.equal(
              (
                await prisma.ficha_tecnica.findUniqueOrThrow({
                  where: { id: atual.id },
                })
              ).status,
              "ATIVA",
            )
          } finally {
            await sql.query("DROP TRIGGER teste_falha_ficha")
          }
        },
      )
    }
  } finally {
    await sql.end()
    await prisma.$disconnect()
    hooks.deregister()
  }
})
