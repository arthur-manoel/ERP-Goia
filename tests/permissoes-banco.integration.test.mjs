import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

test("Permissões: enum e autorização com MySQL local real", async (t) => {
  assert.ok(
    process.env.PERMISSOES_TEST_DATABASE_URL,
    "Defina PERMISSOES_TEST_DATABASE_URL explicitamente",
  )
  const url = new URL(process.env.PERMISSOES_TEST_DATABASE_URL)
  assert.equal(url.protocol, "mysql:")
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Somente banco local",
  )
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
      if (url.endsWith("/src/lib/prisma.ts"))
        return {
          format: "module",
          source: "export const prisma = globalThis.__permissoesPrisma;",
          shortCircuit: true,
        }
      if (url.startsWith("file:") && url.endsWith(".ts"))
        return {
          format: "module",
          shortCircuit: true,
          source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
            },
          }).outputText,
        }
      return next(url, context)
    },
  })
  const { PrismaClient } = await import("../src/generated/prisma/client.ts")
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    allowPublicKeyRetrieval: true,
    connectionLimit: 3,
  })
  const prisma = new PrismaClient({ adapter })
  globalThis.__permissoesPrisma = prisma
  const { allowedCompanies } =
    await import("../modules/catalogos/repository.ts")
  const { recursos } = await import("../src/lib/permissoes.ts")
  const { autorizarEstoque } =
    await import("../src/modules/estoque-minimo/estoque-minimo.authorization.ts")
  const { signAccessToken } =
    await import("../src/modules/auth/auth.service.ts")
  const previousSecret = process.env.ACCESS_TOKEN_SECRET
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const marker = randomBytes(8).toString("hex")
  const empresas = [],
    cargos = [],
    vinculos = []
  let usuario
  try {
    await t.test(
      "DDL contém todos os recursos sem remover os anteriores",
      async () => {
        const [column] =
          await prisma.$queryRaw`SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='permissoes_usuario' AND COLUMN_NAME='recurso'`
        assert.deepEqual(
          [...column.tipo.matchAll(/'([^']+)'/g)].map((match) => match[1]),
          [...recursos],
        )
      },
    )
    usuario = await prisma.usuarios.create({
      data: {
        nome: "Fixture permissoes",
        email: `permissoes-${marker}@example.test`,
        senha: "fixture-sem-login",
        nivel_acesso: "USUARIO",
      },
    })
    for (let i = 0; i < 2; i++) {
      const empresa = await prisma.empresas.create({
        data: {
          razao_social: `Fixture ${marker} ${i}`,
          cnpj: `${marker.slice(0, 13)}${i}`,
        },
      })
      empresas.push(empresa.id)
      const cargo = await prisma.cargos.create({
        data: { id_empresa: empresa.id, nome: "ADMINISTRACAO" },
      })
      cargos.push(cargo.id)
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_usuario: usuario.id,
          id_empresa: empresa.id,
          id_cargo: cargo.id,
          nivel_acesso: "USUARIO",
        },
      })
      vinculos.push(vinculo.id)
    }
    const request = (empresa = empresas[0]) =>
      new Request("http://localhost/api/relatorios/estoque/produtos", {
        headers: {
          Authorization: `Bearer ${signAccessToken({ id: usuario.id, role: "ADMINISTRACAO" })}`,
          "X-Empresa-Id": String(empresa),
        },
      })
    await t.test(
      "cada recurso/ação exige sua concessão e mantém o escopo da empresa",
      async () => {
        for (const recurso of recursos) {
          for (const campo of [
            "pode_ler",
            "pode_criar",
            "pode_editar",
            "pode_excluir",
          ]) {
            assert.deepEqual(
              await allowedCompanies(usuario.id, recurso, campo),
              [],
            )
            const grant = await prisma.permissoes_usuario.create({
              data: { id_usuario_empresa: vinculos[0], recurso, [campo]: true },
            })
            assert.deepEqual(
              await allowedCompanies(usuario.id, recurso, campo),
              [empresas[0]],
            )
            const outraAcao = campo === "pode_ler" ? "pode_editar" : "pode_ler"
            assert.deepEqual(
              await allowedCompanies(usuario.id, recurso, outraAcao),
              [],
            )
            await prisma.permissoes_usuario.delete({ where: { id: grant.id } })
          }
        }
      },
    )
    await t.test(
      "relatórios exigem ambas as leituras no mesmo vínculo",
      async () => {
        const estoque = await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculos[0],
            recurso: "ESTOQUE",
            pode_ler: true,
          },
        })
        const relatorio = await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculos[1],
            recurso: "RELATORIOS",
            pode_ler: true,
          },
        })
        await assert.rejects(
          autorizarEstoque(request(), "ler", ["RELATORIOS"]),
          (e) => e.status === 403,
        )
        await prisma.permissoes_usuario.update({
          where: { id: relatorio.id },
          data: { id_usuario_empresa: vinculos[0] },
        })
        assert.equal(
          (await autorizarEstoque(request(), "ler", ["RELATORIOS"])).idEmpresa,
          empresas[0],
        )
        for (const id of [estoque.id, relatorio.id]) {
          await prisma.permissoes_usuario.update({
            where: { id },
            data: { pode_ler: false },
          })
          await assert.rejects(
            autorizarEstoque(request(), "ler", ["RELATORIOS"]),
            (e) => e.status === 403,
          )
          await prisma.permissoes_usuario.update({
            where: { id },
            data: { pode_ler: true },
          })
        }
      },
    )
    await t.test(
      "usuário, vínculo e empresa inativos negam mesmo com concessão",
      async () => {
        for (const [model, id, ativo, inativo] of [
          ["usuarios", usuario.id, "ATIVO", "INATIVO"],
          ["usuario_empresa", vinculos[0], "ATIVO", "INATIVO"],
          ["empresas", empresas[0], "ATIVA", "INATIVA"],
        ]) {
          await prisma[model].update({
            where: { id },
            data: { status: inativo },
          })
          assert.deepEqual(
            await allowedCompanies(usuario.id, "ESTOQUE", "pode_ler"),
            [],
          )
          await assert.rejects(
            autorizarEstoque(request(), "ler", ["RELATORIOS"]),
            (e) => e.status === 403,
          )
          await prisma[model].update({ where: { id }, data: { status: ativo } })
        }
      },
    )
    await t.test(
      "exceções administrativas continuam exigindo vínculo ativo",
      async () => {
        await prisma.permissoes_usuario.deleteMany({
          where: { id_usuario_empresa: { in: vinculos } },
        })
        await prisma.usuario_empresa.update({
          where: { id: vinculos[0] },
          data: { nivel_acesso: "EMPRESA" },
        })
        assert.deepEqual(
          await allowedCompanies(usuario.id, "COMPRAS", "pode_criar"),
          [empresas[0]],
        )
        await prisma.usuarios.update({
          where: { id: usuario.id },
          data: { nivel_acesso: "ADMIN" },
        })
        assert.deepEqual(
          (await allowedCompanies(usuario.id, "VENDAS", "pode_excluir")).sort(),
          [...empresas].sort(),
        )
        await prisma.usuario_empresa.updateMany({
          where: { id: { in: vinculos } },
          data: { status: "INATIVO" },
        })
        assert.deepEqual(
          await allowedCompanies(usuario.id, "VENDAS", "pode_excluir"),
          [],
        )
      },
    )
  } finally {
    try {
      if (vinculos.length) {
        await prisma.permissoes_usuario.deleteMany({
          where: { id_usuario_empresa: { in: vinculos } },
        })
        await prisma.usuario_empresa.deleteMany({
          where: { id: { in: vinculos } },
        })
      }
      if (usuario) await prisma.usuarios.delete({ where: { id: usuario.id } })
      if (cargos.length)
        await prisma.cargos.deleteMany({ where: { id: { in: cargos } } })
      if (empresas.length)
        await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
    } finally {
      await prisma.$disconnect()
      delete globalThis.__permissoesPrisma
      if (previousSecret === undefined) delete process.env.ACCESS_TOKEN_SECRET
      else process.env.ACCESS_TOKEN_SECRET = previousSecret
      hooks.deregister()
    }
  }
})
