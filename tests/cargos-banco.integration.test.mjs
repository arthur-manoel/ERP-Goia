import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { test } from "node:test"
import mariadb from "mariadb"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"
import { tokenDeSessao } from "./helpers/sessao-integracao.mjs"

test("Cargos com MySQL e sessões reais", async (t) => {
  const url = bancoLocal(process.env.CARGOS_TEST_DATABASE_URL)
  process.env.DATABASE_URL = url.href
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const colecao = await import("../src/app/api/cargos/route.ts")
  const item = await import("../src/app/api/cargos/[id]/route.ts")
  const ativar = await import("../src/app/api/cargos/[id]/ativar/route.ts")
  const historico =
    await import("../src/app/api/cargos/[id]/historico/route.ts")
  const membros = await import("../src/app/api/cargos/[id]/usuarios/route.ts")
  const usuarios = await import("../src/app/api/usuarios/[id]/route.ts")
  const { alterar } = await import("../modules/cargos/service.ts")
  const { acesso } =
    await import("../src/modules/cancelamentos/cancelamentos.authorization.ts")
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
      "Use um banco de testes vazio.",
    )
    const empresa = await prisma.empresas.create({
      data: { razao_social: "Empresa A", cnpj: "00000000000001" },
    })
    const outra = await prisma.empresas.create({
      data: { razao_social: "Empresa B", cnpj: "00000000000002" },
    })
    const criarCargo = (id_empresa, nome) =>
      prisma.cargos.create({ data: { id_empresa, nome } })
    const administrativo = await criarCargo(empresa.id, "Administrador")
    const origem = await criarCargo(empresa.id, "Produção")
    const destino = await criarCargo(empresa.id, "Vendas")
    const alheio = await criarCargo(outra.id, "Gerente")
    const criarUsuario = (email, nivel_acesso = "USUARIO") =>
      prisma.usuarios.create({
        data: { nome: email, email, senha: "fixture", nivel_acesso },
      })
    const admin = await criarUsuario("admin-cargos@example.test", "ADMIN")
    const empregado = await criarUsuario("empregado-cargos@example.test")
    const vincular = (id_usuario, id_cargo, id_empresa = empresa.id) =>
      prisma.usuario_empresa.create({
        data: { id_usuario, id_cargo, id_empresa },
      })
    await vincular(admin.id, administrativo.id)
    const vinculo = await vincular(empregado.id, origem.id)
    const tokenAdmin = await tokenDeSessao(prisma, admin.id, "ADMINISTRACAO")
    const tokenEmpregado = await tokenDeSessao(prisma, empregado.id, "PRODUCAO")
    const chamada = (
      mod,
      method,
      {
        id,
        data,
        tag,
        token = tokenAdmin,
        empresaId = empresa.id,
        query = "",
      } = {},
    ) => {
      const headers = {
        Authorization: "Bearer " + token,
        "X-Empresa-Id": String(empresaId),
      }
      if (tag) headers["If-Match"] = tag
      return mod[method](
        new Request("http://localhost/api/cargos" + query, {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
        }),
        { params: Promise.resolve({ id: String(id) }) },
      )
    }
    const etag = async (id) =>
      (await chamada(item, "GET", { id })).headers.get("ETag")
    let criado
    await t.test(
      "unicidade ignora caixa e resiste a duas inserções simultâneas",
      async () => {
        const criar = (nome) =>
          chamada(colecao, "POST", { data: { id_empresa: empresa.id, nome } })
        const respostas = await Promise.all([
          criar("Gerente"),
          criar("GERENTE"),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [201, 409])
        criado = (await respostas.find((r) => r.status === 201).json()).data
        assert.equal(
          await prisma.cargos.count({ where: { nome: "gerente" } }),
          2,
        )
        assert.equal((await criar(" gerente ")).status, 409)
      },
    )
    await t.test(
      "protege empresa e a flag, e pagina vínculos visíveis ao administrador",
      async () => {
        assert.equal(
          (await chamada(item, "GET", { id: alheio.id })).status,
          404,
        )
        assert.equal(
          (
            await chamada(item, "PATCH", {
              id: alheio.id,
              data: { descricao: "Nova" },
            })
          ).status,
          404,
        )
        assert.equal(
          (await chamada(item, "DELETE", { id: alheio.id })).status,
          404,
        )
        assert.equal(
          (await chamada(colecao, "GET", { empresaId: outra.id })).status,
          403,
        )
        assert.equal(
          (await chamada(item, "GET", { id: criado.id, token: tokenEmpregado }))
            .status,
          403,
        )
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "CARGOS",
            pode_ler: true,
            pode_editar: true,
          },
        })
        assert.equal(
          (await chamada(item, "GET", { id: criado.id, token: tokenEmpregado }))
            .status,
          200,
        )
        assert.equal(
          (
            await chamada(item, "PATCH", {
              id: criado.id,
              tag: await etag(criado.id),
              token: tokenEmpregado,
              data: { aprova_cancelamento: true },
            })
          ).status,
          403,
        )
        const r = await chamada(membros, "GET", {
          id: origem.id,
          query: "?limit=1",
        })
        assert.equal(r.status, 200)
        assert.equal((await r.json()).data.data[0].id_usuario, empregado.id)
        const lista = await chamada(colecao, "GET", {
          query: "?limit=1&search=gerente",
        })
        assert.equal((await lista.json()).data.total, 1)
      },
    )
    await t.test(
      "duas edições com o mesmo ETag geram um vencedor",
      async () => {
        const tag = await etag(criado.id)
        const editar = (descricao) =>
          chamada(item, "PATCH", { id: criado.id, tag, data: { descricao } })
        const respostas = await Promise.all([
          editar("Primeira"),
          editar("Segunda"),
        ])
        assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409])
        assert.equal((await editar("Desatualizada")).status, 409)
        const revisoes = await chamada(historico, "GET", { id: criado.id })
        assert.equal((await revisoes.json()).data.total, 2)
      },
    )
    await t.test(
      "transferência existente valida empresa e cargo ativo, preserva vínculo e libera inativação",
      async () => {
        const tag = await etag(origem.id)
        assert.equal(
          (await chamada(item, "DELETE", { id: origem.id, tag })).status,
          409,
        )
        assert.equal(
          (
            await chamada(item, "DELETE", {
              id: administrativo.id,
              tag: await etag(administrativo.id),
            })
          ).status,
          409,
        )
        const transferir = (idCargo) =>
          chamada(usuarios, "PATCH", { id: empregado.id, data: { idCargo } })
        assert.equal((await transferir(alheio.id)).status, 404)
        assert.equal((await transferir(destino.id)).status, 200)
        assert.equal(
          (
            await prisma.usuario_empresa.findUniqueOrThrow({
              where: { id: vinculo.id },
            })
          ).id_cargo,
          destino.id,
        )
        assert.equal(
          (await chamada(item, "DELETE", { id: origem.id, tag })).status,
          200,
        )
        assert.equal(
          (await chamada(item, "DELETE", { id: origem.id, tag })).status,
          200,
        )
        assert.equal((await transferir(origem.id)).status, 404)
        assert.equal(
          (
            await chamada(ativar, "POST", {
              id: origem.id,
              tag: await etag(origem.id),
            })
          ).status,
          200,
        )
        assert.equal(
          await prisma.auditoria.count({
            where: { tabela: "cargos", id_registro: origem.id },
          }),
          2,
        )
      },
    )
    await t.test(
      "vínculo legado cruzado não recebe autorização de cancelamento",
      async () => {
        await prisma.cargos.update({
          where: { id: alheio.id },
          data: { aprova_cancelamento: true },
        })
        await prisma.usuario_empresa.update({
          where: { id: vinculo.id },
          data: { id_cargo: alheio.id },
        })
        try {
          await assert.rejects(
            acesso(prisma, { idEmpresa: empresa.id, idUsuario: empregado.id }),
            { status: 403 },
          )
        } finally {
          await prisma.usuario_empresa.update({
            where: { id: vinculo.id },
            data: { id_cargo: destino.id },
          })
        }
      },
    )
    await t.test(
      "falha de auditoria reverte o cargo e conserva a revisão",
      async () => {
        const tag = await etag(criado.id)
        const antes = await prisma.cargos.findUniqueOrThrow({
          where: { id: criado.id },
        })
        await sql.query(
          "CREATE TRIGGER teste_falha_cargo BEFORE INSERT ON auditoria FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha de teste'",
        )
        try {
          await assert.rejects(
            alterar(
              { idEmpresa: empresa.id, idUsuario: admin.id },
              criado.id,
              "PATCH",
              tag,
              { descricao: "Rollback" },
            ),
          )
          assert.deepEqual(
            await prisma.cargos.findUniqueOrThrow({ where: { id: criado.id } }),
            antes,
          )
          assert.equal(await etag(criado.id), tag)
        } finally {
          await sql.query("DROP TRIGGER teste_falha_cargo")
        }
      },
    )
  } finally {
    await sql.end()
    await prisma.$disconnect()
    hooks.deregister()
  }
})
