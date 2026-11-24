import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { test } from "node:test"
import mariadb from "mariadb"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"
import { tokenDeSessao } from "./helpers/sessao-integracao.mjs"

test("cadastro de empresas no MySQL dedicado", async (t) => {
  const url = bancoLocal(process.env.EMPRESAS_TEST_DATABASE_URL)
  process.env.DATABASE_URL = url.href
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const collection = await import("../src/app/api/empresas/route.ts")
  const item = await import("../src/app/api/empresas/[id]/route.ts")
  const sql = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  })
  try {
    assert.ok(
      (await prisma.empresas.count()) <= 1,
      "Use banco dedicado vazio ou com apenas a fixture legada.",
    )
    const legado = await prisma.empresas.findFirst()
    if (legado) {
      assert.equal(legado.cnpj, "11222333000181")
      assert.equal(legado.created_at.getTime(), legado.data_cadastro.getTime())
      assert.equal(legado.updated_at.getTime(), legado.data_cadastro.getTime())
    }
    const admin = await prisma.usuarios.create({
      data: {
        nome: "Admin",
        email: "admin@example.test",
        senha: "fixture",
        nivel_acesso: "ADMIN",
      },
    })
    const tokenAdmin = await tokenDeSessao(prisma, admin.id, "ADMINISTRACAO")
    const chamar = (
      method,
      { id, body, token = tokenAdmin, query = "", empresa } = {},
    ) => {
      const headers = { Authorization: "Bearer " + token }
      if (empresa !== undefined) headers["X-Empresa-Id"] = String(empresa)
      const req = new Request(
        "http://localhost/api/empresas" +
          (id === undefined ? "" : "/" + id) +
          query,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      )
      return id === undefined
        ? collection[method](req)
        : item[method](req, { params: Promise.resolve({ id: String(id) }) })
    }
    let a, b
    await t.test(
      "unicidade com CNPJ mascarado e duas criações simultâneas",
      async () => {
        const input = {
          razao_social: "Empresa A",
          cnpj: "04.252.011/0001-10",
          email: "A@Example.test",
        }
        const respostas = await Promise.all([
          chamar("POST", { body: input }),
          chamar("POST", { body: { ...input, cnpj: "04252011000110" } }),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409])
        a = (await respostas.find((r) => r.status === 201).json()).data
        assert.equal(a.cnpj, "04252011000110")
        assert.equal(a.email, "a@example.test")
        assert.equal(
          await prisma.auditoria.count({
            where: { id_empresa: a.id, acao: "INSERT" },
          }),
          1,
        )
        const res = await chamar("POST", {
          body: { razao_social: "Empresa B", cnpj: "45.723.174/0001-10" },
        })
        assert.equal(res.status, 201, JSON.stringify(await res.clone().json()))
        b = (await res.json()).data
      },
    )

    await t.test(
      "escopo aplica vínculo e permissões no detalhe, filtros e paginação",
      async () => {
        const comum = await prisma.usuarios.create({
          data: {
            nome: "Comum",
            email: "comum@example.test",
            senha: "fixture",
          },
        })
        const cargo = await prisma.cargos.create({
          data: { id_empresa: a.id, nome: "Produção" },
        })
        const backupCargo = await prisma.cargos.create({
          data: { id_empresa: b.id, nome: "Produção" },
        })
        const vinculo = await prisma.usuario_empresa.create({
          data: { id_usuario: comum.id, id_empresa: a.id, id_cargo: cargo.id },
        })
        await prisma.usuario_empresa.create({
          data: {
            id_usuario: comum.id,
            id_empresa: b.id,
            id_cargo: backupCargo.id,
          },
        })
        const token = await tokenDeSessao(prisma, comum.id, "PRODUCAO")
        assert.equal((await chamar("GET", { id: a.id, token })).status, 404)
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "EMPRESAS",
            pode_ler: true,
            pode_editar: true,
          },
        })
        assert.equal((await chamar("GET", { id: a.id, token })).status, 200)
        assert.equal((await chamar("GET", { id: b.id, token })).status, 404)
        assert.equal(
          (
            await chamar("PATCH", {
              id: b.id,
              token,
              body: { cidade: "Goiânia" },
            })
          ).status,
          404,
        )
        assert.equal((await chamar("DELETE", { id: b.id, token })).status, 404)
        assert.equal((await chamar("DELETE", { id: a.id, token })).status, 403)
        assert.equal(
          (
            await chamar("PATCH", {
              id: a.id,
              token,
              body: { cidade: "Goiânia" },
            })
          ).status,
          200,
        )
        const somenteA = (
          await (
            await chamar("GET", { token, query: "?limit=1&search=Empresa" })
          ).json()
        ).data
        assert.equal(somenteA.total, 1)
        assert.equal(somenteA.data[0].id, a.id)
        assert.equal(
          (await chamar("GET", { empresa: b.id, token })).status,
          404,
        )
        const todas = (
          await (
            await chamar("GET", { query: "?limit=1&search=Empresa" })
          ).json()
        ).data
        assert.equal(todas.total, 2)
        assert.equal(todas.hasNextPage, true)

        const cancelada = await chamar("DELETE", { id: a.id })
        assert.equal(cancelada.status, 200)
        const inativa = (await cancelada.json()).data
        assert.equal(inativa.inativado_por, admin.id)
        assert.ok(inativa.inativado_em)
        assert.equal((await chamar("GET", { id: a.id, token })).status, 200)
        assert.equal(
          (
            await chamar("PATCH", {
              id: a.id,
              token,
              body: { cidade: "Outra" },
            })
          ).status,
          404,
        )
        assert.equal(
          await prisma.usuario_empresa.count({ where: { id_empresa: a.id } }),
          1,
        )
        const reativada = await chamar("PATCH", {
          id: a.id,
          body: { status: "ATIVA" },
        })
        assert.equal(reativada.status, 200)
        assert.equal((await reativada.json()).data.inativado_por, null)
      },
    )

    await t.test(
      "rollback de edição e inativação quando falha a auditoria",
      async () => {
        const antes = await prisma.empresas.findUniqueOrThrow({
          where: { id: a.id },
        })
        const { alterarEmpresa } =
          await import("../modules/empresas/service.ts")
        await sql.query(
          "CREATE TRIGGER teste_falha_empresa BEFORE INSERT ON auditoria FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha de teste'",
        )
        try {
          await assert.rejects(
            alterarEmpresa({ idUsuario: admin.id }, a.id, "PATCH", {
              cidade: "Outra",
            }),
          )
          await assert.rejects(
            alterarEmpresa({ idUsuario: admin.id }, a.id, "DELETE"),
          )
          assert.deepEqual(
            await prisma.empresas.findUniqueOrThrow({ where: { id: a.id } }),
            antes,
          )
        } finally {
          await sql.query("DROP TRIGGER teste_falha_empresa")
        }
      },
    )
  } finally {
    await sql.end()
    await prisma.$disconnect()
    hooks.deregister()
  }
})
