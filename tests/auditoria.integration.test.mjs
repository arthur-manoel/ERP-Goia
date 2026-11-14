import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"
import { tokenDeSessao } from "./helpers/sessao-integracao.mjs"

const url = process.env.AUDITORIA_TEST_DATABASE_URL
test(
  "Auditoria: commit, rollback físico, isolamento e concorrência no MySQL",
  {
    skip:
      !url &&
      "Defina AUDITORIA_TEST_DATABASE_URL para um MySQL local dedicado e vazio com sufixo _test.",
  },
  async (t) => {
    bancoLocal(url)
    process.env.DATABASE_URL = url
    process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
    const hooks = typescript()
    const { prisma } = await import("../src/lib/prisma.ts")
    const { default: mariadb } = await import("mariadb")
    const banco = new URL(url)
    const ddl = await mariadb.createConnection({
      host: banco.hostname,
      port: Number(banco.port || 3306),
      user: decodeURIComponent(banco.username),
      password: decodeURIComponent(banco.password),
      database: banco.pathname.slice(1),
      allowPublicKeyRetrieval: true, // Conexão somente ao banco local dedicado, validado acima.
    })
    const { GET: consultar } = await import("../src/app/api/auditoria/route.ts")
    const marker = randomUUID().replaceAll("-", "").slice(0, 12)
    const trigger = `audit_fail_${marker}`
    const empresas = [],
      usuarios = [],
      tipos = [],
      produtos = []
    let triggerAtivo = false
    async function comFalhaEsperada(operation) {
      const original = console.error
      console.error = (...args) => {
        if (
          !args.some(
            (arg) =>
              arg instanceof Error &&
              arg.message.includes("Falha intencional de auditoria"),
          )
        )
          original(...args)
      }
      try {
        return await operation()
      } finally {
        console.error = original
      }
    }
    try {
      for (const tabela of [
        "empresas",
        "usuarios",
        "auditoria",
        "cores",
        "tamanhos",
        "categorias",
        "fornecedores",
        "tipos_produto",
        "produtos",
      ])
        assert.equal(
          await prisma[tabela].count(),
          0,
          `Banco de teste deve estar vazio: ${tabela}`,
        )
      for (let i = 0; i < 2; i++) {
        const empresa = await prisma.empresas.create({
          data: {
            razao_social: `Teste auditoria ${marker} ${i}`,
            cnpj: `${Date.now()}${i}`,
          },
        })
        empresas.push(empresa.id)
        const usuario = await prisma.usuarios.create({
          data: {
            nome: `Auditor fictício ${i}`,
            email: `${marker}-${i}@example.invalid`,
            senha: "hash-ficticio-sem-acesso",
            nivel_acesso: "ADMIN",
          },
        })
        usuarios.push(usuario.id)
        const cargo = await prisma.cargos.create({
          data: { id_empresa: empresa.id, nome: "ADMINISTRACAO" },
        })
        await prisma.usuario_empresa.create({
          data: {
            id_empresa: empresa.id,
            id_usuario: usuario.id,
            id_cargo: cargo.id,
            nivel_acesso: "EMPRESA",
          },
        })
      }
      const token = await tokenDeSessao(prisma, usuarios[0], "ADMINISTRACAO")
      function req(path, method = "GET", body, empresa = empresas[0]) {
        return new Request(`http://localhost${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Empresa-Id": String(empresa),
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })
      }
      const { POST: criarTipo } =
        await import("../src/app/api/tipos_produto/route.ts")
      const tipoResponse = await criarTipo(
        req("/api/tipos_produto", "POST", { nome: `Tipo ${marker}` }),
      )
      assert.equal(tipoResponse.status, 201)
      const tipo = (await tipoResponse.json()).data
      tipos.push(tipo.id)
      const casos = [
        {
          tabela: "cores",
          rota: "cores",
          criar: { id_empresa: empresas[0], nome: `Cor ${marker}` },
          editar: { nome: `Cor editada ${marker}` },
        },
        {
          tabela: "tamanhos",
          rota: "tamanhos",
          criar: { id_empresa: empresas[0], nome: `Tam ${marker}` },
          editar: { nome: `Tam editado ${marker}` },
        },
        {
          tabela: "categorias",
          rota: "categorias",
          criar: { id_empresa: empresas[0], nome: `Cat ${marker}` },
          editar: { nome: `Cat editada ${marker}` },
        },
        {
          tabela: "fornecedores",
          rota: "fornecedores",
          criar: {
            id_empresa: empresas[0],
            razao_social: `Fornecedor ${marker}`,
          },
          editar: { razao_social: `Fornecedor editado ${marker}` },
        },
        {
          tabela: "produtos",
          rota: "produtos",
          criar: {
            id_empresa: empresas[0],
            codigo: `P-${marker}`,
            nome: `Produto ${marker}`,
            id_tipo_produto: tipo.id,
            unidade: "UN",
            controla_estoque: 1,
            permite_compra: 1,
            permite_venda: 1,
            permite_producao: 0,
          },
          editar: { nome: `Produto editado ${marker}` },
        },
        {
          tabela: "tipos_produto",
          rota: "tipos_produto",
          criar: { nome: `Outro tipo ${marker}` },
          editar: { nome: `Tipo editado ${marker}` },
        },
      ]
      for (const caso of casos)
        await t.test(
          `${caso.tabela}: criação confirmada e falhas de INSERT/UPDATE revertidas`,
          async () => {
            const collection = await import(
              `../src/app/api/${caso.rota}/route.ts`
            )
            const item = await import(
              `../src/app/api/${caso.rota}/[id]/route.ts`
            )
            const createdResponse = await collection.POST(
              req(`/api/${caso.rota}`, "POST", caso.criar),
            )
            assert.equal(
              createdResponse.status,
              201,
              JSON.stringify(await createdResponse.clone().json()),
            )
            const created = (await createdResponse.json()).data
            if (caso.tabela === "produtos") produtos.push(created.id)
            if (caso.tabela === "tipos_produto") tipos.push(created.id)
            const log = await prisma.auditoria.findFirstOrThrow({
              where: {
                tabela: caso.tabela,
                id_registro: created.id,
                id_empresa: empresas[0],
              },
              orderBy: { id: "desc" },
            })
            assert.equal(log.id_usuario, usuarios[0])
            assert.equal(log.acao, "INSERT")
            assert.equal(log.dados_anteriores, null)
            assert.equal(JSON.parse(log.dados_novos).id, created.id)
            const snapshot = await prisma[caso.tabela].findUniqueOrThrow({
              where: { id: created.id },
            })
            const count = await prisma[caso.tabela].count()
            const logs = await prisma.auditoria.count()
            // Nome aleatório gerado no teste; nunca recebe dados externos. Somente banco local dedicado.
            await ddl.query(
              `CREATE TRIGGER \`${trigger}\` BEFORE INSERT ON auditoria FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha intencional de auditoria'`,
            )
            triggerAtivo = true
            try {
              const updateResponse = await comFalhaEsperada(() =>
                item.PATCH(
                  req(`/api/${caso.rota}/${created.id}`, "PATCH", caso.editar),
                  { params: Promise.resolve({ id: String(created.id) }) },
                ),
              )
              assert.equal(
                updateResponse.status,
                500,
                `Falha da auditoria não pode confirmar edição: ${updateResponse.status}`,
              )
              assert.deepEqual(
                await prisma[caso.tabela].findUniqueOrThrow({
                  where: { id: created.id },
                }),
                snapshot,
              )
              const novaCriacao = {
                ...caso.criar,
                ...(caso.criar.nome
                  ? { nome: `Falha ${marker} ${caso.tabela}` }
                  : { razao_social: `Falha ${marker}` }),
                ...(caso.criar.codigo ? { codigo: `FAIL-${marker}` } : {}),
              }
              const failedResponse = await comFalhaEsperada(() =>
                collection.POST(req(`/api/${caso.rota}`, "POST", novaCriacao)),
              )
              assert.equal(
                failedResponse.status,
                500,
                `Falha da auditoria não pode confirmar criação: ${failedResponse.status}`,
              )
              assert.equal(await prisma[caso.tabela].count(), count)
              assert.equal(await prisma.auditoria.count(), logs)
            } finally {
              await ddl.query(`DROP TRIGGER \`${trigger}\``)
              triggerAtivo = false
            }
            const updatedResponse = await item.PATCH(
              req(`/api/${caso.rota}/${created.id}`, "PATCH", caso.editar),
              { params: Promise.resolve({ id: String(created.id) }) },
            )
            assert.equal(updatedResponse.status, 200)
            const updatedLog = await prisma.auditoria.findFirstOrThrow({
              where: {
                tabela: caso.tabela,
                id_registro: created.id,
                id_empresa: empresas[0],
              },
              orderBy: { id: "desc" },
            })
            assert.equal(updatedLog.acao, "UPDATE")
            assert.deepEqual(
              JSON.parse(updatedLog.dados_anteriores),
              JSON.parse(JSON.stringify(snapshot)),
            )
          },
        )
      await t.test(
        "consulta real valida filtros, paginação e vínculo de empresa",
        async () => {
          const r = await consultar(
            req("/api/auditoria?tabela=cores&acao=UPDATE"),
          )
          assert.equal(r.status, 200)
          const body = await r.json()
          assert.equal(body.total, 1)
          assert.equal(body.itens[0].id_empresa, empresas[0])
          assert.equal(
            (
              await consultar(
                req("/api/auditoria", "GET", undefined, empresas[1]),
              )
            ).status,
            403,
          )
          const semToken = new Request("http://localhost/api/auditoria", {
            headers: { "X-Empresa-Id": String(empresas[0]) },
          })
          assert.equal((await consultar(semToken)).status, 401)
        },
      )
      await t.test(
        "duas edições simultâneas mantêm a cadeia exata de snapshots",
        async () => {
          const cor = await prisma.cores.findFirstOrThrow({
            where: { id_empresa: empresas[0] },
          })
          const ultimo = await prisma.auditoria.findFirstOrThrow({
            where: { tabela: "cores", id_registro: cor.id },
            orderBy: { id: "desc" },
          })
          const { PATCH } = await import("../src/app/api/cores/[id]/route.ts")
          const responses = await Promise.all(
            ["A", "B"].map((nome) =>
              PATCH(
                req(`/api/cores/${cor.id}`, "PATCH", {
                  nome: `Concorrente ${nome} ${marker}`,
                }),
                { params: Promise.resolve({ id: String(cor.id) }) },
              ),
            ),
          )
          assert.deepEqual(
            responses.map((r) => r.status),
            [200, 200],
          )
          const logs = await prisma.auditoria.findMany({
            where: {
              tabela: "cores",
              id_registro: cor.id,
              id: { gt: ultimo.id },
            },
            orderBy: { id: "asc" },
          })
          assert.equal(logs.length, 2)
          assert.deepEqual(
            JSON.parse(logs[0].dados_anteriores),
            JSON.parse(ultimo.dados_novos),
          )
          assert.deepEqual(
            JSON.parse(logs[1].dados_anteriores),
            JSON.parse(logs[0].dados_novos),
          )
          assert.deepEqual(
            JSON.parse(logs[1].dados_novos),
            JSON.parse(
              JSON.stringify(
                await prisma.cores.findUniqueOrThrow({ where: { id: cor.id } }),
              ),
            ),
          )
        },
      )
      await t.test(
        "transferência de fornecedor não revela o contato da outra empresa",
        async () => {
          const fornecedor = await prisma.fornecedores.findFirstOrThrow({
            where: { id_empresa: empresas[0] },
          })
          await prisma.fornecedores.update({
            where: { id: fornecedor.id },
            data: { email: "origem@example.invalid" },
          })
          const autor = await prisma.usuarios.create({
            data: {
              nome: "Autor da transferência",
              email: `${marker}-transferencia@example.invalid`,
              senha: "hash-ficticio",
              nivel_acesso: "ADMIN",
            },
          })
          usuarios.push(autor.id)
          for (const empresa of empresas) {
            const cargo = await prisma.cargos.findFirstOrThrow({
              where: { id_empresa: empresa },
            })
            await prisma.usuario_empresa.create({
              data: {
                id_usuario: autor.id,
                id_empresa: empresa,
                id_cargo: cargo.id,
                nivel_acesso: "EMPRESA",
              },
            })
          }
          const tokenAutor = await tokenDeSessao(
            prisma,
            autor.id,
            "ADMINISTRACAO",
          )
          const transferir = req(
            `/api/fornecedores/${fornecedor.id}`,
            "PATCH",
            { id_empresa: empresas[1], email: "destino@example.invalid" },
          )
          transferir.headers.delete("X-Empresa-Id")
          transferir.headers.set("Authorization", `Bearer ${tokenAutor}`)
          const { PATCH } =
            await import("../src/app/api/fornecedores/[id]/route.ts")
          assert.equal(
            (
              await PATCH(transferir, {
                params: Promise.resolve({ id: String(fornecedor.id) }),
              })
            ).status,
            200,
          )
          const origem = await consultar(
            req(`/api/auditoria?tabela=fornecedores&registro=${fornecedor.id}`),
          )
          const bodyOrigem = await origem.json()
          assert.equal(origem.status, 200)
          assert.equal(bodyOrigem.itens[0].depois, null)
          assert.equal(
            bodyOrigem.itens[0].antes.email,
            "origem@example.invalid",
          )
          assert.ok(
            !JSON.stringify(bodyOrigem).includes("destino@example.invalid"),
          )
          const tokenDestino = await tokenDeSessao(
            prisma,
            usuarios[1],
            "ADMINISTRACAO",
          )
          const requestDestino = req(
            `/api/auditoria?tabela=fornecedores&registro=${fornecedor.id}`,
            "GET",
            undefined,
            empresas[1],
          )
          requestDestino.headers.set("Authorization", `Bearer ${tokenDestino}`)
          const destino = await consultar(requestDestino)
          const bodyDestino = await destino.json()
          assert.equal(destino.status, 200)
          assert.equal(bodyDestino.itens[0].antes, null)
          assert.equal(
            bodyDestino.itens[0].depois.email,
            "destino@example.invalid",
          )
          assert.ok(
            !JSON.stringify(bodyDestino).includes("origem@example.invalid"),
          )
        },
      )
      await t.test(
        "cursor não repete eventos após inserções entre as páginas",
        async () => {
          const tabela = `paginacao_${marker}`
          const data = new Date("2026-11-10T12:00:00Z")
          await prisma.auditoria.createMany({
            data: Array.from({ length: 31 }, () => ({
              id_empresa: empresas[0],
              id_usuario: usuarios[0],
              tabela,
              acao: "UPDATE",
              data_evento: data,
            })),
          })
          const page1 = await (
            await consultar(req(`/api/auditoria?tabela=${tabela}`))
          ).json()
          assert.equal(page1.itens.length, 25)
          assert.ok(page1.proximoCursor)
          await prisma.auditoria.createMany({
            data: [0, 1].map(() => ({
              id_empresa: empresas[0],
              id_usuario: usuarios[0],
              tabela,
              acao: "UPDATE",
              data_evento: new Date("2026-11-11T12:00:00Z"),
            })),
          })
          const page2 = await (
            await consultar(
              req(
                `/api/auditoria?tabela=${tabela}&pagina=2&cursor=${encodeURIComponent(page1.proximoCursor)}`,
              ),
            )
          ).json()
          assert.equal(page2.itens.length, 6)
          assert.equal(page2.proximoCursor, null)
          assert.equal(
            new Set([...page1.itens, ...page2.itens].map((item) => item.id))
              .size,
            31,
          )
          assert.ok(
            page2.itens.every(
              (item) => item.data_evento === data.toISOString(),
            ),
          )
        },
      )
      await t.test(
        "edição de produto e entrada de estoque confirmam juntas sem conflito",
        async () => {
          const local = await prisma.locais_estoque.create({
            data: { id_empresa: empresas[0], nome: `Local ${marker}` },
          })
          const setor = await prisma.setores.create({
            data: {
              id_empresa: empresas[0],
              nome: `Setor ${marker}`,
              tipo: "ESTOQUE",
            },
          })
          const { movimentar } =
            await import("../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository.ts")
          const { PATCH } =
            await import("../src/app/api/produtos/[id]/route.ts")
          for (let i = 0; i < 4; i++) {
            const [edicao, entrada] = await Promise.all([
              PATCH(
                req(`/api/produtos/${produtos[0]}`, "PATCH", {
                  nome: `Produto concorrente ${i} ${marker}`,
                  ...(i % 2 ? { unidade: "UN" } : {}),
                }),
                { params: Promise.resolve({ id: String(produtos[0]) }) },
              ),
              movimentar(
                { idEmpresa: empresas[0], idUsuario: usuarios[0] },
                {
                  idProduto: produtos[0],
                  idLocalEstoque: local.id,
                  idSetor: setor.id,
                  quantidade: "1",
                  observacao: "Entrada concorrente fictícia",
                },
                "entrada",
              ),
            ])
            assert.equal(edicao.status, 200)
            assert.equal(entrada.saldoAtual, `${i + 1}.000`)
          }
          assert.equal(
            await prisma.movimentacao_estoque.count({
              where: { id_empresa: empresas[0], id_produto: produtos[0] },
            }),
            4,
          )
        },
      )
    } finally {
      try {
        if (triggerAtivo)
          await ddl.query(`DROP TRIGGER IF EXISTS \`${trigger}\``)
        if (empresas.length) {
          const scope = { in: empresas }
          await prisma.auditoria.deleteMany({ where: { id_empresa: scope } })
          await prisma.kardex.deleteMany({ where: { id_empresa: scope } })
          await prisma.movimentacao_estoque.deleteMany({
            where: { id_empresa: scope },
          })
          await prisma.estoque.deleteMany({ where: { id_empresa: scope } })
          await prisma.locais_estoque.deleteMany({
            where: { id_empresa: scope },
          })
          await prisma.produto_empresa.deleteMany({
            where: { id_empresa: scope },
          })
          await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
          for (const tabela of [
            "cores",
            "tamanhos",
            "categorias",
            "fornecedores",
          ])
            await prisma[tabela].deleteMany({ where: { id_empresa: scope } })
          await prisma.usuario_empresa.deleteMany({
            where: { id_empresa: scope },
          })
          await prisma.setores.deleteMany({ where: { id_empresa: scope } })
          await prisma.cargos.deleteMany({ where: { id_empresa: scope } })
          await prisma.empresas.deleteMany({ where: { id: scope } })
        }
        await prisma.tipos_produto.deleteMany({ where: { id: { in: tipos } } })
        await prisma.refresh_tokens.deleteMany({
          where: { id_usuario: { in: usuarios } },
        })
        await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
      } finally {
        await prisma.$disconnect()
        await ddl.end()
        hooks.deregister()
      }
    }
  },
)
