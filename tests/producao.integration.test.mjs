import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"
import nextEnv from "@next/env"

const configured = process.argv.includes("--configured-db")
if (configured) nextEnv.loadEnvConfig(process.cwd())
const databaseUrl =
  process.env.PRODUCAO_TEST_DATABASE_URL ||
  (configured ? process.env.DATABASE_URL : undefined)

test(
  "Banco real: ciclo da OP, rollback, isolamento e avanços concorrentes",
  {
    skip:
      !databaseUrl &&
      "Defina PRODUCAO_TEST_DATABASE_URL para um banco de testes com schema já existente.",
  },
  async (t) => {
    const url = new URL(databaseUrl)
    assert.equal(url.protocol, "mysql:")
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    assert.ok(
      url.pathname.length > 1,
      "Informe o nome do banco local de testes",
    )
    // Somente dados de fixtures: nunca executa DDL, migrations ou db push.
    process.env.DATABASE_URL = databaseUrl
    const { registerHooks } = await import("node:module")
    assert.equal(
      typeof registerHooks,
      "function",
      "Use Node >=22.15 para o teste de integração",
    )
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only") {
          return { url: "data:text/javascript,export {};", shortCircuit: true }
        }
        const candidate = specifier.startsWith("@/")
          ? pathToFileURL(path.resolve("src", specifier.slice(2))).href
          : specifier.startsWith(".")
            ? new URL(specifier, context.parentURL).href
            : null
        if (
          candidate?.startsWith("file:") &&
          existsSync(fileURLToPath(candidate + ".ts"))
        ) {
          return { url: candidate + ".ts", shortCircuit: true }
        }
        return next(specifier, context)
      },
      load(url, context, next) {
        if (url.startsWith("file:") && url.endsWith(".ts")) {
          return {
            format: "module",
            shortCircuit: true,
            source: ts.transpileModule(
              readFileSync(fileURLToPath(url), "utf8"),
              {
                compilerOptions: {
                  module: ts.ModuleKind.ESNext,
                  target: ts.ScriptTarget.ES2022,
                },
              },
            ).outputText,
          }
        }
        return next(url, context)
      },
    })
    let prisma
    const empresas = [],
      produtos = [],
      usuarios = [],
      tipos = []
    const marker = randomUUID().slice(0, 8)
    try {
      ;({ prisma } = await import("../src/lib/prisma.ts"))
      const service =
        await import("../src/modules/producao/producao.service.ts")
      const schemas = await import("../src/modules/producao/producao.schema.ts")
      const auth =
        await import("../src/modules/producao/producao.authorization.ts")
      const { signAccessToken } =
        await import("../src/modules/auth/auth.service.ts")
      process.env.ACCESS_TOKEN_SECRET = "production-integration-only-secret"
      for (let i = 0; i < 2; i++) {
        const empresa = await prisma.empresas.create({
          data: {
            razao_social: `OP teste ${marker}`,
            cnpj: `${Date.now()}${i}`,
          },
        })
        empresas.push(empresa.id)
      }
      const usuario = await prisma.usuarios.create({
        data: {
          nome: "Teste OP",
          email: `${marker}@op.example.test`,
          senha: "fixture-sem-login",
          nivel_acesso: "ADMIN",
        },
      })
      usuarios.push(usuario.id)
      const cargo = await prisma.cargos.create({
        data: { id_empresa: empresas[0], nome: "Produção" },
      })
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_usuario: usuario.id,
          id_empresa: empresas[0],
          id_cargo: cargo.id,
        },
      })
      const authorization = `Bearer ${signAccessToken({ id: usuario.id, role: "ADMINISTRACAO" })}`
      const request = (empresa) =>
        new Request("http://localhost", {
          headers: { authorization, "X-Empresa-Id": String(empresa) },
        })
      assert.deepEqual(await auth.autorizar(request(empresas[0]), "criar"), {
        idUsuario: usuario.id,
        idEmpresa: empresas[0],
      })
      await assert.rejects(
        auth.autorizar(request(empresas[1]), "criar"),
        (e) => e.status === 403,
      )
      await prisma.usuario_empresa.update({
        where: { id: vinculo.id },
        data: { status: "INATIVO" },
      })
      await assert.rejects(
        auth.autorizar(request(empresas[0]), "criar"),
        (e) => e.status === 403,
      )
      await prisma.usuario_empresa.update({
        where: { id: vinculo.id },
        data: { status: "ATIVO" },
      })
      const tipo = await prisma.tipos_produto.create({
        data: { nome: `OP teste ${marker}` },
      })
      tipos.push(tipo.id)
      for (let i = 0; i < 3; i++) {
        const produto = await prisma.produtos.create({
          data: {
            nome: `Produto teste ${i}`,
            codigo: `${marker}-${i}`,
            id_tipo_produto: tipo.id,
            permite_producao: i < 2,
          },
        })
        produtos.push(produto.id)
        await prisma.produto_empresa.create({
          data: { id_produto: produto.id, id_empresa: empresas[0] },
        })
      }
      await prisma.ficha_tecnica.create({
        data: {
          id_empresa: empresas[0],
          id_produto: produtos[0],
          status: "ATIVA",
          ficha_tecnica_item: {
            create: {
              id_produto_componente: produtos[2],
              quantidade: "0.125",
              perda_percentual: "25",
            },
          },
        },
      })
      const setores = []
      for (let i = 0; i < 3; i++) {
        const setor = await prisma.setores.create({
          data: { id_empresa: empresas[0], nome: `Setor ${i}` },
        })
        setores.push(setor.id)
      }
      const ctx = { idUsuario: usuario.id, idEmpresa: empresas[0] }
      const opened = await service.abrirOrdem(
        ctx,
        schemas.abrirSchema.parse({
          idProduto: produtos[0],
          quantidade: "3",
          setores,
        }),
      )
      const id = opened.ordem.id
      const consumo = (result) =>
        result.ordem.ordem_producao_item[0].ordem_producao_consumo_planejado[0].quantidade_necessaria.toString()
      assert.equal(consumo(opened), "0.375")
      assert.equal(opened.perdaAplicada, false)
      const changed = await service.alterarOrdem(ctx, id, {
        statusEsperado: "PLANEJADA",
        quantidade: "4",
      })
      assert.equal(consumo(changed), "0.5")
      // Falha após UPDATE do cabeçalho: toda a transação deve voltar ao valor anterior.
      await assert.rejects(
        service.alterarOrdem(ctx, id, {
          statusEsperado: "PLANEJADA",
          idProduto: produtos[1],
          quantidade: "7",
        }),
        (e) => e.status === 400,
      )
      const stored = await prisma.ordem_producao.findUniqueOrThrow({
        where: { id },
      })
      assert.equal(stored.quantidade_planejada.toString(), "4")
      assert.equal(
        (
          await prisma.ordem_producao_consumo_planejado.findFirstOrThrow({
            where: { id_ordem_producao: id },
          })
        ).quantidade_necessaria.toString(),
        "0.5",
      )
      await assert.rejects(
        service.alterarOrdem({ ...ctx, idEmpresa: empresas[1] }, id, {
          statusEsperado: "PLANEJADA",
          observacao: "inválido",
        }),
        (e) => e.status === 404,
      )
      await service.avancarOrdem(ctx, id, {
        statusEsperado: "PLANEJADA",
        setorEsperado: null,
        statusDestino: "LIBERADA",
      })
      await assert.rejects(
        service.alterarOrdem(ctx, id, {
          statusEsperado: "LIBERADA",
          quantidade: "8",
        }),
        (e) => e.status === 409,
      )
      const initialRace = await Promise.allSettled(
        Array.from({ length: 2 }, () =>
          service.avancarOrdem(ctx, id, {
            statusEsperado: "LIBERADA",
            setorEsperado: null,
            statusDestino: "EM_PRODUCAO",
          }),
        ),
      )
      assert.equal(
        initialRace.filter((r) => r.status === "fulfilled").length,
        1,
      )
      assert.equal(
        initialRace.find((r) => r.status === "rejected").reason.status,
        409,
      )
      await assert.rejects(
        service.encerrarOrdem(ctx, id, {
          statusEsperado: "EM_PRODUCAO",
          setorEsperado: setores[0],
        }),
        (e) => e.status === 409,
      )
      // Duas chamadas mantêm o mesmo status: só uma pode mudar do primeiro ao segundo setor.
      const race = await Promise.allSettled(
        Array.from({ length: 2 }, () =>
          service.avancarOrdem(ctx, id, {
            statusEsperado: "EM_PRODUCAO",
            setorEsperado: setores[0],
            statusDestino: "EM_PRODUCAO",
          }),
        ),
      )
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1)
      assert.equal(race.find((r) => r.status === "rejected").reason.status, 409)
      assert.equal(
        (await prisma.ordem_producao.findUniqueOrThrow({ where: { id } }))
          .id_setor,
        setores[1],
      )
      await service.avancarOrdem(ctx, id, {
        statusEsperado: "EM_PRODUCAO",
        setorEsperado: setores[1],
        statusDestino: "EM_PRODUCAO",
      })
      const closed = await service.encerrarOrdem(ctx, id, {
        statusEsperado: "EM_PRODUCAO",
        setorEsperado: setores[2],
      })
      assert.equal(closed.ordem.status, "CONCLUIDA")
      assert.equal(closed.baixaEstoque, "pendente")
      assert.equal(closed.ordem.ordem_producao_movimentacao_setor.length, 3)
      assert.equal(consumo(closed), "0.5")
      assert.equal(
        await prisma.consumo_producao.count({
          where: { id_ordem_producao: id },
        }),
        0,
      )
      assert.equal(
        await prisma.movimentacao_estoque.count({
          where: { id_empresa: empresas[0] },
        }),
        0,
      )
      await assert.rejects(
        service.encerrarOrdem(ctx, id, {
          statusEsperado: "EM_PRODUCAO",
          setorEsperado: setores[2],
        }),
        (e) => e.status === 409,
      )
      assert.ok(
        await prisma.auditoria.count({
          where: {
            id_empresa: empresas[0],
            tabela: "ordem_producao",
            acao: "UPDATE",
          },
        }),
      )
      if (process.argv.includes("--http")) {
        const { testarApi } = await import("./producao.http.mjs")
        await testarApi(t, {
          prisma,
          empresas,
          produtos,
          tipos,
          setores,
          authorization,
          marker,
        })
      }
    } finally {
      if (prisma) {
        try {
          if (
            empresas.length ||
            usuarios.length ||
            produtos.length ||
            tipos.length
          ) {
            await prisma.ordem_producao.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.auditoria.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.ficha_tecnica.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.produto_empresa.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.usuario_empresa.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.setores.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.cargos.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.sequencias_automaticas.deleteMany({
              where: { id_empresa: { in: empresas } },
            })
            await prisma.produtos.deleteMany({
              where: { id: { in: produtos } },
            })
            await prisma.tipos_produto.deleteMany({
              where: { id: { in: tipos } },
            })
            await prisma.usuarios.deleteMany({
              where: { id: { in: usuarios } },
            })
            await prisma.empresas.deleteMany({
              where: { id: { in: empresas } },
            })
          }
        } finally {
          await prisma.$disconnect()
        }
      }
      hooks.deregister()
    }
  },
)
