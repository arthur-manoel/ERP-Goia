import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import jwt from "jsonwebtoken"
import {
  bancoLocal,
  typescript,
  httpProducao,
} from "./helpers/integracao-pedidos.mjs"
import {
  criarCenarioEmpresas,
  removerCenarioEmpresas,
} from "./helpers/auth-empresas.mjs"
const url = bancoLocal(process.env.AUTH_EMPRESAS_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = "auth-empresas-local-" + randomUUID()
delete process.env.DEV_ID_USUARIO
delete process.env.DEV_ID_EMPRESA
const hooks = typescript()
const { prisma } = await import("../src/lib/prisma.ts")
let server, cenario
try {
  cenario = await criarCenarioEmpresas(prisma)
  const http = await httpProducao()
  server = http.server
  async function call(path, token, expected = 200, extra = {}) {
    const r = await fetch(http.base + path, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
    })
    const body = await r.json()
    assert.equal(r.status, expected, JSON.stringify(body))
    return { r, body }
  }
  const tokens = {}
  await test("HTTP real: empresas por vínculo, JWT e permissões preservadas", async (t) => {
    for (const [key, user] of Object.entries(cenario.usuarios))
      await t.test(
        `login real e descoberta de ${key}, sem empresa selecionada`,
        async () => {
          const r = await fetch(http.base + "/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              password: user.password,
            }),
          })
          assert.equal(r.status, 200, await r.clone().text())
          tokens[key] = (await r.json()).accessToken
          const result = await call("/api/auth/empresas", tokens[key])
          assert.equal(
            result.r.headers.get("cache-control"),
            "private, no-store",
          )
          assert.ok(
            result.r.headers
              .get("vary")
              .split(",")
              .map((v) => v.trim().toLowerCase())
              .includes("authorization"),
          )
          assert.deepEqual(result.body, {
            success: true,
            data: {
              usuario: { id: user.id, nome: user.nome, email: user.email },
              empresas: user.empresas,
            },
          })
          assert.equal(
            new Set(result.body.data.empresas.map((e) => e.id)).size,
            user.empresas.length,
          )
        },
      )
    await t.test(
      "vendas e financeiro acessam operação permitida, estoque continua 403",
      async () => {
        for (const [key, path] of [
          ["vendas", "/api/clientes"],
          ["financeiro", "/api/contas_receber"],
        ]) {
          const token = tokens[key],
            id = cenario.usuarios[key].empresas[0].id
          await call(path, token, 200, { "X-Empresa-Id": String(id) })
          await call("/api/estoque-minimo", token, 403, {
            "X-Empresa-Id": String(id),
          })
          const lista = await call("/api/estoque-minimo/empresas", token)
          assert.deepEqual(lista.body.empresas, [])
        }
        await call("/api/clientes", tokens.semPermissoes, 403, {
          "X-Empresa-Id": String(cenario.empresas[0].id),
        })
        const estoque = await call(
          "/api/estoque-minimo/empresas",
          tokens.estoque,
        )
        assert.deepEqual(
          estoque.body.empresas,
          cenario.usuarios.estoque.empresas,
        )
      },
    )
    await t.test(
      "token ausente, inválido e expirado são 401; cookies e headers não autenticam",
      async () => {
        await call("/api/auth/empresas", undefined, 401)
        await call("/api/auth/empresas", "invalido", 401)
        const expired = jwt.sign(
          { id: cenario.usuarios.vendas.id, role: "VENDAS" },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: -1 },
        )
        await call("/api/auth/empresas", expired, 401)
        await call("/api/auth/empresas", undefined, 401, {
          Cookie: `accessToken=${tokens.vendas}`,
          "X-Usuario-Id": String(cenario.usuarios.vendas.id),
        })
      },
    )
    await t.test(
      "outro usuário não é consultável; empresa manipulada não altera os próprios vínculos",
      async () => {
        await call(
          `/api/auth/empresas?id_usuario=${cenario.usuarios.financeiro.id}`,
          tokens.vendas,
          400,
        )
        const result = await call("/api/auth/empresas", tokens.vendas, 200, {
          "X-Empresa-Id": String(cenario.empresas[1].id),
        })
        assert.deepEqual(
          result.body.data.empresas,
          cenario.usuarios.vendas.empresas,
        )
      },
    )
    await t.test(
      "requisições alternadas e concorrentes não compartilham cache de usuário",
      async () => {
        const r = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            call("/api/auth/empresas", tokens[i % 2 ? "vendas" : "financeiro"]),
          ),
        )
        r.forEach((x, i) =>
          assert.deepEqual(
            x.body.data.empresas,
            cenario.usuarios[i % 2 ? "vendas" : "financeiro"].empresas,
          ),
        )
      },
    )
    await t.test(
      "vínculos removidos são omitidos e perfil perdido ou usuário inativo recebe 401",
      async () => {
        const multi = cenario.usuarios.multi
        await prisma.usuario_empresa.updateMany({
          where: { id_usuario: multi.id, id_empresa: multi.empresas[0].id },
          data: { status: "INATIVO" },
        })
        assert.deepEqual(
          (await call("/api/auth/empresas", tokens.multi)).body.data.empresas,
          [multi.empresas[1]],
        )
        await prisma.usuario_empresa.updateMany({
          where: { id_usuario: cenario.usuarios.semPermissoes.id },
          data: { status: "INATIVO" },
        })
        await call("/api/auth/empresas", tokens.semPermissoes, 401)
        await prisma.usuarios.update({
          where: { id: cenario.usuarios.semPermissoes.id },
          data: { status: "INATIVO" },
        })
        await call("/api/auth/empresas", tokens.semPermissoes, 401)
      },
    )
    await t.test(
      "descoberta não concede ou altera nenhuma permissão",
      async () => {
        const rows = await prisma.permissoes_usuario.findMany({
          where: { id_usuario_empresa: { in: cenario.vinculos } },
          orderBy: { id: "asc" },
        })
        assert.equal(rows.length, 6)
        for (const row of rows) {
          assert.equal(row.pode_ler, true)
          assert.equal(row.pode_criar, false)
          assert.equal(row.pode_editar, false)
          assert.equal(row.pode_excluir, false)
        }
      },
    )
  })
} finally {
  server?.kill()
  if (cenario) await removerCenarioEmpresas(prisma, cenario)
  await prisma.$disconnect()
  hooks.deregister()
}
