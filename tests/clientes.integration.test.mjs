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
  process.env.CLIENTES_TEST_DATABASE_URL ||
  (configured ? process.env.DATABASE_URL : undefined)

test(
  "MySQL real: rotas de clientes, concorrência, isolamento, histórico e rollback",
  {
    skip:
      !databaseUrl &&
      "Defina CLIENTES_TEST_DATABASE_URL para um MySQL local com schema já preparado.",
  },
  async (t) => {
    const url = new URL(databaseUrl)
    assert.equal(url.protocol, "mysql:")
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
      "Use somente banco local de testes",
    )
    assert.ok(url.pathname.length > 1, "Informe o banco de testes")
    process.env.DATABASE_URL = databaseUrl
    const { registerHooks } = await import("node:module")
    assert.equal(typeof registerHooks, "function", "Use Node >=22.15")
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only")
          return { url: "data:text/javascript,export {};", shortCircuit: true }
        const candidate = specifier.startsWith("@/")
          ? pathToFileURL(path.resolve("src", specifier.slice(2))).href
          : specifier.startsWith(".")
            ? new URL(specifier, context.parentURL).href
            : null
        if (
          candidate?.startsWith("file:") &&
          existsSync(fileURLToPath(candidate + ".ts"))
        )
          return { url: candidate + ".ts", shortCircuit: true }
        return next(specifier, context)
      },
      load(url, context, next) {
        if (url.startsWith("file:") && url.endsWith(".ts"))
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
        return next(url, context)
      },
    })
    const marker = randomUUID(),
      empresas = []
    let prisma, idUsuario
    const originalSecret = process.env.ACCESS_TOKEN_SECRET
    try {
      ;({ prisma } = await import("../src/lib/prisma.ts"))
      const collection = await import("../src/app/api/clientes/route.ts")
      const single = await import("../src/app/api/clientes/[id]/route.ts")
      const history =
        await import("../src/app/api/clientes/[id]/pedidos/route.ts")
      const repository =
        await import("../src/modules/clientes/clientes.repository.ts")
      const { signAccessToken } =
        await import("../src/modules/auth/auth.service.ts")
      process.env.ACCESS_TOKEN_SECRET = "clientes-integration-only-secret"
      // Fixtures próprias; sem DDL, migrations, seed ou criação de permissões.
      for (let i = 0; i < 2; i++) {
        const empresa = await prisma.empresas.create({
          data: {
            razao_social: `Clientes teste ${marker}`,
            cnpj: `${Date.now()}${i}`,
          },
        })
        empresas.push(empresa.id)
      }
      const usuario = await prisma.usuarios.create({
        data: {
          nome: "Teste clientes",
          email: `${marker}@clientes.example.test`,
          senha: "fixture-sem-login",
          nivel_acesso: "ADMIN",
        },
      })
      idUsuario = usuario.id
      for (const id_empresa of empresas) {
        const cargo = await prisma.cargos.create({
          data: { id_empresa, nome: "Vendas" },
        })
        await prisma.usuario_empresa.create({
          data: { id_empresa, id_usuario: idUsuario, id_cargo: cargo.id },
        })
      }
      const token = signAccessToken({ id: idUsuario, role: "VENDAS" })
      const req = (method = "GET", body, empresa = empresas[0], query = "") =>
        new Request(`http://localhost/api/clientes${query}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(empresa === null ? {} : { "X-Empresa-Id": String(empresa) }),
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      const context = (id) => ({ params: Promise.resolve({ id: String(id) }) })
      const create = async (body, empresa = empresas[0]) => {
        const response = await collection.POST(req("POST", body, empresa))
        const data = await response.json()
        assert.equal(response.status, 201, JSON.stringify(data))
        return data.cliente
      }
      let cliente, outro
      await t.test(
        "cadastro, documentos e tipo inferido sem alterar schema",
        async () => {
          cliente = await create({
            nomeRazaoSocial: " Ana ",
            cpfCnpj: "529.982.247-25",
            email: "ana@example.test",
            estado: "pe",
            cep: "50000-000",
          })
          assert.equal(cliente.cpf_cnpj, "52998224725")
          assert.equal(cliente.tipoPessoa, "FISICA")
          assert.equal(cliente.estado, "PE")
          assert.equal(cliente.cep, "50000000")
          outro = await create({ nomeRazaoSocial: "Bia" })
          assert.equal(outro.tipoPessoa, null)
          assert.equal(
            (
              await collection.POST(
                req("POST", {
                  nomeRazaoSocial: "Inválido",
                  cpfCnpj: "52998224724",
                }),
              )
            ).status,
            400,
          )
          assert.equal(
            (
              await collection.POST(
                req("POST", {
                  nomeRazaoSocial: "Duplicado",
                  cpfCnpj: cliente.cpf_cnpj,
                }),
              )
            ).status,
            409,
          )
          assert.equal(
            (await single.GET(req(), context(cliente.id))).status,
            200,
          )
        },
      )
      await t.test(
        "mesmo documento em outra empresa; acesso cruzado negado",
        async () => {
          const externo = await create(
            { nomeRazaoSocial: "Externo", cpfCnpj: cliente.cpf_cnpj },
            empresas[1],
          )
          for (const response of [
            await single.GET(req(), context(externo.id)),
            await single.PATCH(
              req("PATCH", { nomeRazaoSocial: "Invasão" }),
              context(externo.id),
            ),
            await single.DELETE(req("DELETE"), context(externo.id)),
            await history.GET(req(), context(externo.id)),
          ])
            assert.equal(response.status, 404)
          const list = await (await collection.GET(req())).json()
          assert.ok(list.clientes.every((c) => c.id_empresa === empresas[0]))
        },
      )
      await t.test(
        "edição parcial, próprio documento, null, inativação e reativação",
        async () => {
          let response = await single.PATCH(
            req("PATCH", {
              telefone: "81999999999",
              cpfCnpj: "529.982.247-25",
            }),
            context(cliente.id),
          )
          assert.equal(response.status, 200)
          assert.equal(
            (await response.json()).cliente.email,
            "ana@example.test",
          )
          response = await single.PATCH(
            req("PATCH", { email: null }),
            context(cliente.id),
          )
          assert.equal((await response.json()).cliente.email, null)
          assert.equal(
            (await single.DELETE(req("DELETE"), context(cliente.id))).status,
            200,
          )
          assert.equal(
            (await single.DELETE(req("DELETE"), context(cliente.id))).status,
            200,
          )
          assert.equal(
            (
              await collection.POST(
                req("POST", {
                  nomeRazaoSocial: "Duplicado inativo",
                  cpfCnpj: cliente.cpf_cnpj,
                }),
              )
            ).status,
            409,
          )
          response = await single.PATCH(
            req("PATCH", { status: "ATIVO" }),
            context(cliente.id),
          )
          assert.equal((await response.json()).cliente.status, "ATIVO")
          const audits = await prisma.auditoria.findMany({
            where: {
              id_empresa: empresas[0],
              tabela: "clientes",
              id_registro: cliente.id,
            },
          })
          assert.equal(audits.filter((a) => a.acao === "INSERT").length, 1)
          assert.ok(
            audits.some(
              (a) =>
                a.acao === "UPDATE" &&
                JSON.parse(a.dados_novos).status === "INATIVO",
            ),
          )
        },
      )
      await t.test("máscaras legadas e CNPJ alfanumérico", async () => {
        await prisma.clientes.updateMany({
          where: { id: cliente.id, id_empresa: empresas[0] },
          data: { cpf_cnpj: "529.982.247-25" },
        })
        assert.equal(
          (
            await collection.POST(
              req("POST", {
                nomeRazaoSocial: "Duplicado legado",
                cpfCnpj: "52998224725",
              }),
            )
          ).status,
          409,
        )
        const filtered = await (
          await collection.GET(
            req("GET", undefined, empresas[0], "?cpfCnpj=52998224725"),
          )
        ).json()
        assert.deepEqual(
          filtered.clientes.map((c) => c.id),
          [cliente.id],
        )
        const pj = await create({
          nomeRazaoSocial: "PJ",
          cpfCnpj: "12.abc.345/01de-35",
        })
        assert.equal(pj.cpf_cnpj, "12ABC34501DE35")
        assert.equal(pj.tipoPessoa, "JURIDICA")
        await prisma.clientes.updateMany({
          where: { id: pj.id, id_empresa: empresas[0] },
          data: { cpf_cnpj: "12.abc.345/01de-35" },
        })
        assert.equal(
          (
            await single.PATCH(
              req("PATCH", { cpfCnpj: "12ABC34501DE35" }),
              context(outro.id),
            )
          ).status,
          409,
        )
      })
      await t.test(
        "criações concorrentes deixam exatamente um documento cadastrado",
        async () => {
          const responses = await Promise.all(
            [1, 2, 3].map((i) =>
              collection.POST(
                req("POST", {
                  nomeRazaoSocial: `Concorrente ${i}`,
                  cpfCnpj: "11144477735",
                }),
              ),
            ),
          )
          assert.deepEqual(
            responses.map((r) => r.status).sort(),
            [201, 409, 409],
          )
          assert.equal(
            await prisma.clientes.count({
              where: { id_empresa: empresas[0], cpf_cnpj: "11144477735" },
            }),
            1,
          )
        },
      )
      await t.test(
        "edição concorre com cadastro pelo mesmo documento",
        async () => {
          const responses = await Promise.all([
            single.PATCH(
              req("PATCH", { cpfCnpj: "11222333000181" }),
              context(outro.id),
            ),
            collection.POST(
              req("POST", {
                nomeRazaoSocial: "Disputa com edição",
                cpfCnpj: "11.222.333/0001-81",
              }),
            ),
          ])
          assert.equal(responses.filter((r) => r.status === 409).length, 1)
          assert.equal(
            responses.filter((r) => [200, 201].includes(r.status)).length,
            1,
          )
          assert.equal(
            await prisma.clientes.count({
              where: { id_empresa: empresas[0], cpf_cnpj: "11222333000181" },
            }),
            1,
          )
        },
      )
      await t.test(
        "paginação, filtros e curingas literais de nome",
        async () => {
          const nome = "Literal 10%_\\"
          const literal = await create({ nomeRazaoSocial: nome })
          await create({ nomeRazaoSocial: "Literal 10XYZ" })
          const filtered = await (
            await collection.GET(
              req(
                "GET",
                undefined,
                empresas[0],
                `?nome=${encodeURIComponent(nome)}&status=ATIVO`,
              ),
            )
          ).json()
          assert.deepEqual(
            filtered.clientes.map((c) => c.id),
            [literal.id],
          )
          const first = await (
            await collection.GET(
              req("GET", undefined, empresas[0], "?pagina=1&limite=1"),
            )
          ).json()
          const second = await (
            await collection.GET(
              req("GET", undefined, empresas[0], "?pagina=2&limite=1"),
            )
          ).json()
          assert.equal(first.paginacao.total, second.paginacao.total)
          assert.notEqual(first.clientes[0].id, second.clientes[0].id)
          assert.equal(
            (
              await collection.GET(
                req("GET", undefined, empresas[0], "?limite=101"),
              )
            ).status,
            400,
          )
        },
      )
      await t.test(
        "histórico isolado, ordenado, paginado, preservado na inativação",
        async () => {
          const ids = []
          for (const [index, empresa] of [
            empresas[0],
            empresas[0],
            empresas[1],
          ].entries()) {
            const venda = await prisma.venda.create({
              data: {
                id_empresa: empresa,
                id_cliente: cliente.id,
                id_usuario: idUsuario,
                numero: `CL-${marker.slice(0, 8)}-${index}`,
                status: "CONFIRMADA",
                valor_total: "1234.50",
                data_venda: new Date("2026-09-22T12:00:00Z"),
              },
            })
            ids.push(venda.id)
          }
          await single.DELETE(req("DELETE"), context(cliente.id))
          const response = await history.GET(
            req("GET", undefined, empresas[0], "?limite=1"),
            context(cliente.id),
          )
          assert.equal(response.status, 200)
          const data = await response.json()
          assert.equal(data.paginacao.total, 2)
          assert.equal(data.pedidos[0].id, ids[1])
          assert.equal(data.pedidos[0].valor_total, "1234.50")
          assert.equal(data.pedidos[0].data_venda, "2026-09-22T12:00:00.000Z")
          assert.equal(
            (await (await history.GET(req(), context(outro.id))).json()).pedidos
              .length,
            0,
          )
          assert.equal(
            (await history.GET(req(), context(2147483647))).status,
            404,
          )
        },
      )
      await t.test(
        "vínculo, usuário e empresa ativos; nenhuma permissão inserida",
        async () => {
          assert.equal(
            (await collection.GET(req("GET", undefined, null))).status,
            400,
          )
          assert.equal(
            (await collection.GET(new Request("http://localhost/api/clientes")))
              .status,
            401,
          )
          const wrongRole = signAccessToken({ id: idUsuario, role: "PRODUCAO" })
          assert.equal(
            (
              await collection.GET(
                new Request("http://localhost/api/clientes", {
                  headers: { authorization: `Bearer ${wrongRole}` },
                }),
              )
            ).status,
            403,
          )
          await prisma.usuario_empresa.updateMany({
            where: { id_usuario: idUsuario, id_empresa: empresas[0] },
            data: { status: "INATIVO" },
          })
          assert.equal((await collection.GET(req())).status, 403)
          await prisma.usuario_empresa.updateMany({
            where: { id_usuario: idUsuario, id_empresa: empresas[0] },
            data: { status: "ATIVO" },
          })
          await prisma.usuarios.update({
            where: { id: idUsuario },
            data: { status: "INATIVO" },
          })
          assert.equal((await collection.GET(req())).status, 403)
          await prisma.usuarios.update({
            where: { id: idUsuario },
            data: { status: "ATIVO", nivel_acesso: "USUARIO" },
          })
          assert.equal((await collection.GET(req())).status, 403)
          await prisma.usuarios.update({
            where: { id: idUsuario },
            data: { nivel_acesso: "ADMIN" },
          })
          await prisma.empresas.update({
            where: { id: empresas[0] },
            data: { status: "INATIVA" },
          })
          assert.equal((await collection.GET(req())).status, 403)
          await prisma.empresas.update({
            where: { id: empresas[0] },
            data: { status: "ATIVA" },
          })
          assert.equal((await collection.GET(req())).status, 200)
        },
      )
      await t.test(
        "rollback de cadastro e auditoria na mesma transação",
        async () => {
          const ctx = { idUsuario, idEmpresa: empresas[0], podeExcluir: true }
          const sentinel = new Error("rollback controlado")
          await assert.rejects(
            repository.gravacao(ctx, async (tx) => {
              const row = await repository.criarCliente(tx, ctx, {
                nome_razao_social: `rollback-${marker}`,
              })
              await repository.auditar(tx, ctx, null, row)
              throw sentinel
            }),
            (error) => error === sentinel,
          )
          assert.equal(
            await prisma.clientes.count({
              where: {
                id_empresa: empresas[0],
                nome_razao_social: `rollback-${marker}`,
              },
            }),
            0,
          )
          assert.equal(
            await prisma.auditoria.count({
              where: {
                id_empresa: empresas[0],
                dados_novos: { contains: `rollback-${marker}` },
              },
            }),
            0,
          )
        },
      )
    } finally {
      // Remover somente fixtures das empresas/usuário criados por esta execução.
      try {
        if (prisma && empresas.length) {
          await prisma.auditoria.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.venda.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.clientes.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.usuario_empresa.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.cargos.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
        }
        if (prisma && idUsuario)
          await prisma.usuarios.delete({ where: { id: idUsuario } })
      } finally {
        await prisma?.$disconnect()
        hooks.deregister()
        if (originalSecret === undefined) delete process.env.ACCESS_TOKEN_SECRET
        else process.env.ACCESS_TOKEN_SECRET = originalSecret
      }
    }
  },
)
