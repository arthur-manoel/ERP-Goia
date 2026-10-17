import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"
import { hash, verify, argon2id } from "argon2"

const require = createRequire(import.meta.url)
const runtime = require("@prisma/client/runtime/client")
const input = {
  nome: "Funcionário teste",
  email: "funcionario@example.test",
  password: "Senha-teste-123",
  idCargo: 2,
  idSetor: 3,
}
function setup() {
  const cache = new Map(),
    calls = []
  const state = { users: [], auditoria: [], failAudit: false, revoked: false }
  const admin = {
    id_empresa: 10,
    nivel_acesso: "EMPRESA",
    usuarios: { nivel_acesso: "USUARIO" },
  }
  let memberships = [admin]
  const auth = { user: { id: 5, role: "ADMINISTRACAO" } }
  const cargo = { id: 2, nome: "Produção", status: "ATIVO" }
  const setor = { id: 3, nome: "Corte", tipo: "Produção", status: "ATIVO" }
  const tx = {
    usuario_empresa: {
      findFirst: async ({ where }) => {
        calls.push(["revalidar", where])
        return state.revoked
          ? null
          : (memberships.find((m) => m.id_empresa === where.id_empresa) ?? null)
      },
    },
    cargos: {
      findFirst: async ({ where }) => {
        calls.push(["cargo", where])
        return where.id === 2 &&
          where.id_empresa === 10 &&
          cargo.status === "ATIVO"
          ? cargo
          : null
      },
    },
    setores: {
      findFirst: async ({ where }) => {
        calls.push(["setor", where])
        return where.id === 3 &&
          where.id_empresa === 10 &&
          setor.status === "ATIVO"
          ? setor
          : null
      },
    },
    usuarios: {
      findUnique: async ({ where, include }) => {
        const user = state.users.find((u) =>
          where.email ? u.email === where.email : u.id === where.id,
        )
        if (!user) return null
        if (!include) return { id: user.id }
        return {
          ...user,
          usuario_empresa: user.usuario_empresa.map((m) => ({
            ...m,
            empresas: { status: "ATIVA" },
            cargos: cargo,
            setores: setor,
          })),
        }
      },
      create: async ({ data, select }) => {
        calls.push(["create", data, select])
        const { usuario_empresa, ...fields } = data
        const user = {
          id: 20,
          ...fields,
          data_cadastro: new Date(),
          usuario_empresa: [{ id: 30, ...usuario_empresa.create }],
        }
        state.users.push(user)
        return Object.fromEntries(Object.keys(select).map((k) => [k, user[k]]))
      },
    },
    auditoria: {
      create: async ({ data }) => {
        if (state.failAudit) throw new Error("audit failed")
        state.auditoria.push(data)
      },
    },
  }
  const prisma = {
    usuario_empresa: {
      findMany: async (args) => {
        calls.push(["vinculos", args])
        return memberships
      },
    },
    $transaction: async (fn, config) => {
      calls.push(["transaction", config])
      const before = structuredClone(state)
      try {
        return await fn(tx)
      } catch (e) {
        Object.assign(state, before)
        throw e
      }
    },
  }
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const mod = { exports: {} }
    cache.set(file, mod)
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    function localRequire(id) {
      if (id === "server-only") return {}
      if (id === "@/generated/prisma/client") return { Prisma: runtime }
      if (id === "@/lib/prisma") return { prisma }
      if (id === "@/lib/authorize") return { requireRole: async () => auth }
      if (id === "@/lib/password")
        return {
          hashPassword: (password) => hash(password, { type: argon2id }),
        }
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`)
      if (id.startsWith("."))
        return load(path.resolve(path.dirname(file), id + ".ts"))
      return require(id)
    }
    new Function("require", "module", "exports", code)(
      localRequire,
      mod,
      mod.exports,
    )
    return mod.exports
  }
  const { criarHandler } = load("src/modules/usuarios/router.ts")
  function post(body = input, empresa = "10") {
    return criarHandler(
      new Request("http://localhost/api/usuarios", {
        method: "POST",
        headers: empresa === null ? {} : { "X-Empresa-Id": empresa },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    )
  }
  return {
    post,
    state,
    admin,
    auth,
    cargo,
    setor,
    tx,
    prisma,
    calls,
    load,
    setMemberships: (value) => {
      memberships = value
    },
  }
}

test("201: funcionário e vínculo USUARIO, hash Argon2, auditoria sem credenciais e login compatível", async () => {
  const { post, state, calls, tx, load } = setup()
  const response = await post({
    ...input,
    nome: " Funcionário teste ",
    email: " FUNCIONARIO@example.test ",
  })
  assert.equal(response.status, 201)
  assert.equal(response.headers.get("cache-control"), "no-store")
  const result = await response.json()
  assert.equal(result.usuario.nome, input.nome)
  assert.equal(result.usuario.email, input.email)
  assert.equal(result.usuario.nivel_acesso, "USUARIO")
  assert.equal(result.usuario.usuario_empresa[0].nivel_acesso, "USUARIO")
  assert.equal(result.usuario.usuario_empresa[0].id_empresa, 10)
  assert.equal(result.perfil, "PRODUCAO")
  assert.equal("senha" in result.usuario, false)
  assert.equal(await verify(state.users[0].senha, input.password), true)
  assert.match(state.users[0].senha, /^\$argon2id\$/)
  assert.equal(
    JSON.stringify(state.auditoria).includes(state.users[0].senha),
    false,
  )
  assert.equal(JSON.stringify(state.auditoria).includes(input.password), false)
  assert.equal(
    calls.find(([kind]) => kind === "transaction")[1].isolationLevel,
    "Serializable",
  )
  assert.equal(
    "permissoes_usuario" in
      calls.find(([kind]) => kind === "create")[1].usuario_empresa.create,
    false,
  )
  const { createPrismaAuthDb } = load("src/modules/auth/auth.prisma-adapter.ts")
  const loginUser = await createPrismaAuthDb(tx).getUserByEmail(input.email)
  assert.equal(loginUser.role, "PRODUCAO")
  assert.equal(await verify(loginUser.passwordHash, input.password), true)
})

test("400: entradas inválidas, elevação de privilégio e seleção de empresa no corpo", async () => {
  const { post, state } = setup()
  for (const extra of [
    { nivel_acesso: "ADMIN" },
    { nivelAcesso: "EMPRESA" },
    { perfil: "ADMINISTRACAO" },
    { permissoes: [] },
    { idEmpresa: 11 },
    { status: "ATIVO" },
    { password: "123" },
    { email: "invalido" },
    { nome: " " },
    { idCargo: 0 },
    { idSetor: "3" },
  ]) {
    assert.equal((await post({ ...input, ...extra })).status, 400)
  }
  assert.equal((await post("{")).status, 400)
  assert.equal(state.users.length, 0)
})

test("401/403: funcionário com perfil administrativo não pode criar usuários", async () => {
  const { post, admin, auth, calls } = setup()
  admin.nivel_acesso = "USUARIO"
  assert.equal((await post()).status, 403)
  assert.equal(
    calls.some(([kind]) => kind === "create"),
    false,
  )
  delete auth.user
  auth.error = Response.json({ error: "Não autenticado." }, { status: 401 })
  assert.equal((await post()).status, 401)
})

test("empresa: vínculo ativo obrigatório, seleção e revalidação transacional", async () => {
  const { post, admin, state, setMemberships, calls } = setup()
  admin.usuarios.nivel_acesso = "ADMIN"
  for (const empresa of ["11", "1e1", "0", "abc"])
    assert.equal((await post(input, empresa)).status, 403)
  setMemberships([admin, { ...admin, id_empresa: 11 }])
  assert.equal((await post(input, null)).status, 400)
  setMemberships([admin])
  state.revoked = true
  assert.equal((await post()).status, 403)
  assert.equal(state.users.length, 0)
  assert.deepEqual(calls.find(([kind]) => kind === "revalidar")[1], {
    id_usuario: 5,
    id_empresa: 10,
    status: "ATIVO",
    empresas: { status: "ATIVA" },
    usuarios: { status: "ATIVO" },
  })
  setMemberships([])
  assert.equal((await post()).status, 403)
})

test("404: cargo/setor inválido, inativo ou de outra empresa", async () => {
  const { post, cargo, setor, state, setMemberships, admin } = setup()
  assert.equal((await post({ ...input, idCargo: 99 })).status, 404)
  assert.equal((await post({ ...input, idSetor: 99 })).status, 404)
  cargo.status = "INATIVO"
  assert.equal((await post()).status, 404)
  cargo.status = "ATIVO"
  setor.status = "INATIVO"
  assert.equal((await post()).status, 404)
  setor.status = "ATIVO"
  setMemberships([{ ...admin, id_empresa: 11 }])
  assert.equal((await post(input, "11")).status, 404)
  assert.equal(state.users.length, 0)
})

test("422: perfil de login ausente ou ambíguo; setor pode ser omitido", async () => {
  const { post, cargo, state } = setup()
  cargo.nome = "Auxiliar"
  assert.equal((await post({ ...input, idSetor: null })).status, 422)
  cargo.nome = "Vendas"
  assert.equal((await post()).status, 422)
  assert.equal(state.users.length, 0)
  assert.equal((await post({ ...input, idSetor: undefined })).status, 201)
})

test("409: e-mail duplicado e disputa de unicidade não criam outro usuário", async () => {
  const { post, state, tx } = setup()
  assert.equal((await post()).status, 201)
  assert.equal((await post()).status, 409)
  assert.equal(state.users.length, 1)
  tx.usuarios.create = async () => {
    throw new runtime.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "7.10.0",
    })
  }
  assert.equal(
    (await post({ ...input, email: "outro@example.test" })).status,
    409,
  )
  assert.equal(state.users.length, 1)
})

test("falha de auditoria reverte usuário e vínculo sem expor credenciais", async () => {
  const { post, state } = setup()
  state.failAudit = true
  const original = console.error
  const logs = []
  console.error = (...args) => logs.push(args)
  try {
    const response = await post()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), {
      error: "Não foi possível cadastrar o funcionário.",
    })
    assert.equal(state.users.length, 0)
    assert.equal(state.auditoria.length, 0)
    assert.equal(JSON.stringify(logs).includes(input.password), false)
  } finally {
    console.error = original
  }
})

test("conflitos do adapter Prisma instalado retornam 409", async () => {
  const { DriverAdapterError } = require("@prisma/driver-adapter-utils")
  const { load, prisma } = setup()
  const { gravacao } = load("src/modules/usuarios/usuarios.repository.ts")
  for (const cause of [
    { kind: "UniqueConstraintViolation", originalCode: "1062" },
    { kind: "ForeignKeyConstraintViolation", originalCode: "1452" },
    { kind: "TransactionWriteConflict", originalCode: "1213" },
  ]) {
    prisma.$transaction = async () => {
      throw new DriverAdapterError(cause)
    }
    await assert.rejects(
      gravacao({ idUsuario: 5, idEmpresa: 10 }, async () => null),
      (e) => e.status === 409,
    )
  }
})
