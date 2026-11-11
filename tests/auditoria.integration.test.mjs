import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"

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
    })
    const { signAccessToken } = await import("../src/lib/jwt.ts")
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
      const token = signAccessToken({ id: usuarios[0], role: "ADMINISTRACAO" })
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
    } finally {
      if (triggerAtivo) await ddl.query(`DROP TRIGGER IF EXISTS \`${trigger}\``)
      if (empresas.length) {
        const scope = { in: empresas }
        await prisma.auditoria.deleteMany({ where: { id_empresa: scope } })
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
        await prisma.cargos.deleteMany({ where: { id_empresa: scope } })
        await prisma.empresas.deleteMany({ where: { id: scope } })
      }
      await prisma.tipos_produto.deleteMany({ where: { id: { in: tipos } } })
      await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
      await prisma.$disconnect()
      await ddl.end()
      hooks.deregister()
    }
  },
)
