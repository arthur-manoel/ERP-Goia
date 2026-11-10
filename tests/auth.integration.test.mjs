import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"
import nextEnv from "@next/env"
import jwt from "jsonwebtoken"

const configuredDatabase = process.argv.includes("--configured-db")
if (configuredDatabase) nextEnv.loadEnvConfig(process.cwd())
const databaseUrl =
  process.env.AUTH_TEST_DATABASE_URL ||
  (configuredDatabase ? process.env.DATABASE_URL : undefined)

test(
  "Banco real: revogação por sessão e perfil, rotação, expiração e concorrência",
  {
    skip:
      !databaseUrl &&
      "Defina AUTH_TEST_DATABASE_URL ou use --configured-db para o banco de testes configurado",
  },
  async (t) => {
    const url = new URL(databaseUrl)
    assert.equal(url.protocol, "mysql:")
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    assert.ok(
      url.pathname.length > 1,
      "Informe o nome do banco local de testes",
    )
    process.env.DATABASE_URL = databaseUrl
    process.env.ACCESS_TOKEN_SECRET = "integration-test-secret-only"

    // Carrega os módulos de produção, sem substituir Prisma ou o repository.
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
    let empresaId
    const userIds = []
    try {
      ;({ prisma } = await import("../src/lib/prisma.ts"))
      const service = await import("../src/modules/auth/auth.service.ts")
      const { configureAuthDb } = await import("../src/lib/auth-db.ts")
      const { createPrismaAuthDb } =
        await import("../src/modules/auth/auth.prisma-adapter.ts")
      configureAuthDb(createPrismaAuthDb(prisma))
      const password = "integration-test-password"
      for (let i = 0; i < 2; i++) {
        const user = await prisma.usuarios.create({
          data: {
            nome: "Auth integration",
            email: `${randomUUID()}@example.test`,
            senha: await service.hashPassword(password),
            nivel_acesso: "ADMIN",
          },
        })
        userIds.push(user.id)
      }
      const user = await prisma.usuarios.findUniqueOrThrow({
        where: { id: userIds[0] },
      })
      const credentials = { email: user.email, password }
      assert.equal(
        await service.login({ ...credentials, password: "incorrect" }),
        null,
      )
      const logged = await service.login(credentials)
      assert.ok(await service.verifyAccessToken(logged.accessToken))
      const digest = (token) => createHash("sha256").update(token).digest("hex")
      const rowFor = (token) =>
        prisma.refresh_tokens.findUniqueOrThrow({
          where: { token: digest(token) },
        })
      const first = await rowFor(logged.refreshToken)
      assert.equal(typeof first.id, "number")
      assert.equal(first.id_usuario, user.id)
      assert.equal(first.revogado, false)
      assert.equal(first.data_revogacao, null)
      assert.ok(first.data_criacao instanceof Date)
      assert.ok(Math.abs(first.data_expiracao - Date.now() - 604800000) < 5000)

      const otherSession = await service.issueRefreshToken(user.id)
      const otherUser = await service.issueRefreshToken(userIds[1])
      const renewed = await service.refresh(logged.refreshToken)
      assert.ok(await service.verifyAccessToken(renewed.accessToken))
      assert.ok(await service.verifyAccessToken(logged.accessToken))
      const rotated = await rowFor(logged.refreshToken)
      const successor = await rowFor(renewed.refreshToken)
      assert.equal(rotated.replaced_by, successor.id)
      assert.equal(rotated.sessao_id, successor.sessao_id)
      assert.equal(rotated.revogado, true)
      assert.ok(rotated.data_revogacao instanceof Date)
      assert.equal(await service.refresh(logged.refreshToken), null)
      assert.equal(await service.verifyAccessToken(logged.accessToken), null)
      assert.equal(await service.verifyAccessToken(renewed.accessToken), null)
      for (const token of [renewed.refreshToken, otherSession]) {
        assert.equal(await service.refresh(token), null)
        assert.ok((await rowFor(token)).data_revogacao instanceof Date)
      }
      assert.ok(await service.refresh(otherUser))

      const otherDevice = await service.login(credentials)
      const session = await service.login(credentials)
      const sessionRotated = await service.refresh(session.refreshToken)
      await service.logout(session.refreshToken)
      const loggedOut = await rowFor(session.refreshToken)
      await service.logout(session.refreshToken)
      assert.equal(
        (await rowFor(session.refreshToken)).data_revogacao.getTime(),
        loggedOut.data_revogacao.getTime(),
      )
      assert.equal(await service.refresh(session.refreshToken), null)
      assert.equal(await service.refresh(sessionRotated.refreshToken), null)
      assert.equal(await service.verifyAccessToken(session.accessToken), null)
      assert.equal(
        await service.verifyAccessToken(sessionRotated.accessToken),
        null,
      )
      assert.ok(await service.verifyAccessToken(otherDevice.accessToken))
      assert.ok(await service.refresh(otherDevice.refreshToken))

      const racing = await service.login(credentials)
      const [raced] = await Promise.all([
        service.refresh(racing.refreshToken),
        service.logout(racing.refreshToken),
      ])
      assert.equal(await service.verifyAccessToken(racing.accessToken), null)
      assert.equal(await service.refresh(racing.refreshToken), null)
      if (raced) {
        assert.equal(await service.verifyAccessToken(raced.accessToken), null)
        assert.equal(await service.refresh(raced.refreshToken), null)
      }

      t.mock.timers.enable({ apis: ["Date"], now: new Date() })
      try {
        const sameSecond = await service.login(credentials)
        const { iat, exp } = jwt.decode(sameSecond.accessToken)
        const expiredJwt = jwt.sign(
          { ...jwt.decode(sameSecond.accessToken), exp: iat - 1 },
          process.env.ACCESS_TOKEN_SECRET,
        )
        await assert.rejects(service.logout(undefined, expiredJwt), {
          status: 401,
        })
        await service.logout(sameSecond.refreshToken, expiredJwt)
        const row = await rowFor(sameSecond.refreshToken)
        assert.equal(row.data_revogacao.getTime() / 1000, iat)
        assert.ok(exp * 1000 > Date.now())
        assert.equal(
          await service.verifyAccessToken(sameSecond.accessToken),
          null,
        )
      } finally {
        t.mock.timers.reset()
      }

      const expired = await service.issueRefreshToken(user.id)
      await prisma.refresh_tokens.update({
        where: { token: digest(expired) },
        data: { data_expiracao: new Date("2020-01-01") },
      })
      assert.equal(await service.refresh(expired), null)
      const concurrent = await service.issueRefreshToken(user.id)
      const results = await Promise.all([
        service.rotateRefreshToken(concurrent),
        service.rotateRefreshToken(concurrent),
      ])
      assert.equal(results.filter(Boolean).length, 1)
      assert.equal(await service.refresh(results.find(Boolean).token), null)

      const { handler } = await import("../src/modules/fluxos/router.ts")
      const { requireRole } = await import("../src/lib/authorize.ts")
      const empresa = await prisma.empresas.create({
        data: {
          razao_social: "Teste revogação",
          cnpj: randomUUID().slice(0, 18),
        },
      })
      empresaId = empresa.id
      const cargo = await prisma.cargos.create({
        data: { id_empresa: empresaId, nome: "Operador" },
      })
      const setor = await prisma.setores.create({
        data: { id_empresa: empresaId, nome: "Produção" },
      })
      const senha = await service.hashPassword(password)
      const alvos = []
      for (let i = 0; i < 2; i++) {
        const target = await prisma.usuarios.create({
          data: {
            nome: "Operador",
            email: `${randomUUID()}@example.test`,
            senha,
          },
        })
        userIds.push(target.id)
        await prisma.usuario_empresa.create({
          data: {
            id_usuario: target.id,
            id_empresa: empresaId,
            id_cargo: cargo.id,
            id_setor: setor.id,
          },
        })
        alvos.push({
          email: target.email,
          session: await service.login({ email: target.email, password }),
        })
      }
      await prisma.usuario_empresa.create({
        data: {
          id_usuario: user.id,
          id_empresa: empresaId,
          id_cargo: cargo.id,
          id_setor: setor.id,
        },
      })
      const admin = await service.login(credentials)
      const { session: alvo } = alvos[0]
      const validacao = (accessToken, roles) =>
        requireRole(
          new Request("http://localhost", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          roles,
        )
      const alterar = (accessToken, nome) =>
        handler("setor", "editar")(
          new Request("http://localhost/api/setores/1", {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "X-Empresa-Id": String(empresaId),
            },
            body: JSON.stringify({ nome }),
          }),
          { params: Promise.resolve({ id: String(setor.id) }) },
        )
      assert.ok((await validacao(alvo.accessToken, ["PRODUCAO"])).user)
      assert.equal((await alterar(alvo.accessToken, "Financeiro")).status, 403)
      assert.ok(await service.verifyAccessToken(alvo.accessToken))
      const [reperfil, edit] = await Promise.all([
        service.refresh(alvo.refreshToken),
        alterar(admin.accessToken, "Financeiro"),
      ])
      assert.equal(edit.status, 200, await edit.text())
      for (const { session: antigo } of alvos) {
        assert.equal(
          (await validacao(antigo.accessToken, ["PRODUCAO"])).error.status,
          401,
        )
        assert.equal(await service.refresh(antigo.refreshToken), null)
      }
      if (reperfil) {
        assert.equal(
          await service.verifyAccessToken(reperfil.accessToken),
          null,
        )
        assert.equal(await service.refresh(reperfil.refreshToken), null)
      }
      assert.ok(await service.verifyAccessToken(admin.accessToken))
      const novo = await service.login({ email: alvos[0].email, password })
      assert.equal(novo.role, "FINANCEIRO")
      assert.equal(
        (await validacao(novo.accessToken, ["PRODUCAO"])).error.status,
        403,
      )
      assert.equal((await alterar(admin.accessToken, "Produção")).status, 200)
      assert.equal(await service.verifyAccessToken(alvo.accessToken), null)
      assert.equal(await service.verifyAccessToken(novo.accessToken), null)
    } finally {
      if (prisma) {
        try {
          if (empresaId)
            await prisma.auditoria.deleteMany({
              where: { id_empresa: empresaId },
            })
          if (userIds.length)
            await prisma.usuarios.deleteMany({ where: { id: { in: userIds } } })
          if (empresaId) {
            await prisma.cargos.deleteMany({ where: { id_empresa: empresaId } })
            await prisma.empresas.delete({ where: { id: empresaId } })
          }
        } finally {
          await prisma.$disconnect()
        }
      }
      hooks.deregister()
    }
  },
)
