import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import ts from "typescript"

const require = createRequire(import.meta.url)
const runtime = require("@prisma/client/runtime/client")
const cpf = "52998224725"
const outroCpf = "11144477735"
const cnpj = "11222333000181"
const alfanumerico = "12ABC34501DE35"
const ctx = { idUsuario: 5, idEmpresa: 10, podeExcluir: true }

function setup() {
  const cache = new Map(),
    calls = []
  const state = { clientes: [], vendas: [], auditoria: [], empresaAtiva: true }
  const permissao = {
    recurso: "CLIENTES",
    pode_ler: true,
    pode_criar: true,
    pode_editar: true,
    pode_excluir: true,
  }
  const vinculo = {
    id_empresa: 10,
    nivel_acesso: "USUARIO",
    usuarios: { nivel_acesso: "USUARIO" },
    permissoes_usuario: [permissao],
  }
  const vinculos = [vinculo]
  const token = { id: 5, role: "VENDAS" }
  const normalize = (value) => value?.replace(/[.\/\- ]/g, "").toUpperCase()
  const match = (item, where) =>
    Object.entries(where).every(([key, value]) => {
      if (value === undefined) return true
      if (value && typeof value === "object") {
        if ("in" in value) return value.in.includes(item[key])
        if ("contains" in value) return item[key].includes(value.contains)
      }
      return item[key] === value
    })
  const tx = {
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?")
      calls.push(["sql", sql, values])
      if (sql.includes("FROM empresas"))
        return state.empresaAtiva ? [{ id: values[0] }] : []
      assert.ok(sql.includes("FROM clientes"))
      return state.clientes
        .filter(
          (item) =>
            item.id_empresa === values[0] &&
            normalize(item.cpf_cnpj) === values[1],
        )
        .map(({ id }) => ({ id }))
    },
    clientes: {
      async create({ data }) {
        calls.push(["create", data])
        const cliente = {
          id: state.clientes.length + 1,
          cpf_cnpj: null,
          status: "ATIVO",
          data_cadastro: new Date("2026-09-22T12:00:00Z"),
          ...Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          ),
        }
        state.clientes.push(cliente)
        return { ...cliente }
      },
      async findFirst({ where }) {
        calls.push(["find", where])
        const cliente = state.clientes.find((item) => match(item, where))
        return cliente ? { ...cliente } : null
      },
      async updateMany({ where, data }) {
        calls.push(["update", where, data])
        const clientes = state.clientes.filter((item) => match(item, where))
        for (const cliente of clientes)
          Object.assign(
            cliente,
            Object.fromEntries(
              Object.entries(data).filter(([, value]) => value !== undefined),
            ),
          )
        return { count: clientes.length }
      },
      async count({ where }) {
        return state.clientes.filter((item) => match(item, where)).length
      },
      async findMany(args) {
        calls.push(["list", args])
        return state.clientes
          .filter((item) => match(item, args.where))
          .sort(
            (a, b) =>
              a.nome_razao_social.localeCompare(b.nome_razao_social) ||
              a.id - b.id,
          )
          .slice(args.skip, args.skip + args.take)
      },
    },
    venda: {
      async count({ where }) {
        return state.vendas.filter((item) => match(item, where)).length
      },
      async findMany(args) {
        calls.push(["history", args])
        return state.vendas
          .filter((item) => match(item, args.where))
          .sort((a, b) => b.data_venda - a.data_venda || b.id - a.id)
          .slice(args.skip, args.skip + args.take)
          .map((item) =>
            Object.fromEntries(
              Object.keys(args.select).map((key) => [key, item[key]]),
            ),
          )
      },
    },
    auditoria: {
      async create(args) {
        state.auditoria.push(args.data)
      },
    },
  }
  const prisma = {
    usuario_empresa: {
      async findMany(args) {
        calls.push(["memberships", args])
        return vinculos
      },
    },
    async $transaction(fn, options) {
      calls.push(["transaction", options])
      const antes = structuredClone({
        clientes: state.clientes,
        auditoria: state.auditoria,
      })
      try {
        return await fn(tx)
      } catch (error) {
        Object.assign(state, antes)
        throw error
      }
    },
  }
  function load(file) {
    file = path.resolve(file)
    if (file === path.resolve("src/lib/jwt.ts"))
      return {
        verifyAccessToken: (value) => (value === "valid" ? token : null),
      }
    if (cache.has(file)) return cache.get(file).exports
    const loadedModule = { exports: {} }
    cache.set(file, loadedModule)
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
      if (id === "@/lib/jwt")
        return {
          verifyAccessToken: (value) => (value === "valid" ? token : null),
        }
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`)
      if (id.startsWith("."))
        return load(path.resolve(path.dirname(file), id + ".ts"))
      return require(id)
    }
    new Function("require", "module", "exports", code)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    )
    return loadedModule.exports
  }
  return {
    state,
    calls,
    tx,
    prisma,
    vinculos,
    vinculo,
    permissao,
    token,
    load,
    schemas: load("src/modules/clientes/clientes.schema.ts"),
    documentos: load("src/modules/clientes/clientes.documento.ts"),
    service: load("src/modules/clientes/clientes.service.ts"),
    router: load("src/modules/clientes/router.ts"),
  }
}

function request(method = "GET", body, headers = {}, search = "") {
  return new Request(`http://localhost/api/clientes${search}`, {
    method,
    headers: {
      authorization: "Bearer valid",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const context = (id) => ({ params: Promise.resolve({ id: String(id) }) })

test("CPF/CNPJ: máscara, zeros iniciais, dois DVs e CNPJ alfanumérico oficial", () => {
  const { documentos, schemas } = setup()
  for (const doc of [
    cpf,
    "529.982.247-25",
    outroCpf,
    cnpj,
    "11.222.333/0001-81",
    alfanumerico,
    " 12.abc.345/01de-35 ",
    "00.000.000/0001-91",
    "00.000.000/E08G-12",
  ]) {
    assert.equal(documentos.documentoValido(doc), true, doc)
    assert.equal(
      schemas.documentoSchema.parse(doc),
      documentos.normalizarDocumento(doc),
    )
    const normalized = documentos.normalizarDocumento(doc)
    for (const index of [normalized.length - 2, normalized.length - 1]) {
      const mutated =
        normalized.slice(0, index) +
        String((Number(normalized[index]) + 1) % 10) +
        normalized.slice(index + 1)
      assert.equal(documentos.documentoValido(mutated), false, mutated)
    }
  }
  for (const doc of [
    "",
    "00000000000",
    "11111111111",
    "00000000000000",
    "11111111111111",
    "5299822472",
    "529982247255",
    "529a98224725",
    "529 982 247 25",
    "529.982247-25",
    "12ABC34501DE3A",
    "12ÁBC34501DE35",
    "52998224725;DROP",
    "52998224725\n123",
  ]) {
    assert.equal(documentos.documentoValido(doc), false, doc)
  }
  assert.equal(documentos.inferirTipoPessoa(cpf), "FISICA")
  assert.equal(documentos.inferirTipoPessoa(alfanumerico), "JURIDICA")
  assert.equal(documentos.inferirTipoPessoa(null), null)
  assert.equal(documentos.inferirTipoPessoa("legado inválido"), null)
})

test("schemas: campos, null, limites, status, IDs e paginação estritos", () => {
  const { schemas } = setup()
  assert.equal(
    schemas.criarSchema.parse({
      nomeRazaoSocial: " Maria ",
      estado: "pe",
      cep: "50000-000",
    }).cep,
    "50000000",
  )
  assert.equal(schemas.editarSchema.parse({ cpfCnpj: null }).cpfCnpj, null)
  for (const value of [
    {},
    { nomeRazaoSocial: " " },
    { nomeRazaoSocial: "x".repeat(151) },
    { nomeRazaoSocial: "Nome", id_empresa: 20 },
    { nomeRazaoSocial: "Nome", tipoPessoa: "JURIDICA" },
    { nomeRazaoSocial: "Nome", status: "EXCLUIDO" },
    { nomeRazaoSocial: "Nome", estado: "XX" },
    { nomeRazaoSocial: "Nome", email: "ruim" },
  ])
    assert.equal(schemas.criarSchema.safeParse(value).success, false)
  assert.equal(schemas.editarSchema.safeParse({}).success, false)
  assert.deepEqual(schemas.listarSchema.parse({}), { pagina: 1, limite: 20 })
  for (const value of [
    { pagina: "0" },
    { pagina: "1.5" },
    { pagina: "1e2" },
    { pagina: "2147483648" },
    { limite: "101" },
    { limite: "-1" },
    { empresa: "20" },
    { nome: "" },
    { cpfCnpj: "123" },
  ])
    assert.equal(schemas.listarSchema.safeParse(value).success, false)
  for (const id of [0, -1, 1.5, 2147483648, NaN])
    assert.equal(schemas.idSchema.safeParse(id).success, false)
})

test("rotas: CRUD, inferência, normalização, limpeza parcial e auditoria", async () => {
  const s = setup()
  const collection = s.load("src/app/api/clientes/route.ts")
  const single = s.load("src/app/api/clientes/[id]/route.ts")
  const created = await collection.POST(
    request("POST", {
      nomeRazaoSocial: " Maria ",
      cpfCnpj: "529.982.247-25",
      telefone: "123",
    }),
  )
  assert.equal(created.status, 201)
  const { cliente } = await created.json()
  assert.equal(cliente.nome_razao_social, "Maria")
  assert.equal(cliente.cpf_cnpj, cpf)
  assert.equal(cliente.tipoPessoa, "FISICA")
  assert.equal(cliente.id_empresa, 10)
  assert.equal((await single.GET(request(), context(cliente.id))).status, 200)
  const edited = await single.PATCH(
    request("PATCH", { email: null, cpfCnpj: null }),
    context(cliente.id),
  )
  assert.equal(edited.status, 200)
  const changed = (await edited.json()).cliente
  assert.equal(changed.tipoPessoa, null)
  assert.equal(changed.telefone, "123")
  assert.equal(changed.email, null)
  const deleted = await single.DELETE(request("DELETE"), context(cliente.id))
  assert.equal((await deleted.json()).cliente.status, "INATIVO")
  assert.equal(s.state.clientes.length, 1)
  assert.equal(
    (await single.DELETE(request("DELETE"), context(cliente.id))).status,
    200,
  )
  assert.equal(
    (
      await single.PATCH(
        request("PATCH", { status: "ATIVO" }),
        context(cliente.id),
      )
    ).status,
    200,
  )
  assert.deepEqual(
    s.state.auditoria.map((a) => a.acao),
    ["INSERT", "UPDATE", "UPDATE", "UPDATE", "UPDATE"],
  )
  assert.ok(
    s.state.auditoria.every(
      (a) =>
        a.id_empresa === 10 && a.id_usuario === 5 && a.tabela === "clientes",
    ),
  )
  assert.ok(
    s.calls.findIndex(
      ([type, sql]) => type === "sql" && sql.includes("FOR UPDATE"),
    ) < s.calls.findIndex(([type]) => type === "create"),
  )
})

test("duplicidade: inclui legados/inativos, exclui próprio ID e permite outra empresa", async () => {
  const s = setup()
  s.state.clientes.push({
    id: 50,
    id_empresa: 10,
    nome_razao_social: "Legado",
    cpf_cnpj: "529.982.247-25",
    status: "INATIVO",
  })
  assert.equal(
    (
      await s.router.criarHandler(
        request("POST", { nomeRazaoSocial: "Outra", cpfCnpj: cpf }),
      )
    ).status,
    409,
  )
  const proprio = await s.router.editarHandler(
    request("PATCH", { cpfCnpj: cpf }),
    context(50),
  )
  assert.equal(proprio.status, 200)
  await s.service.cadastrarCliente(
    { ...ctx, idEmpresa: 20 },
    s.schemas.criarSchema.parse({
      nomeRazaoSocial: "Outra empresa",
      cpfCnpj: cpf,
    }),
  )
  const created = await s.router.criarHandler(
    request("POST", { nomeRazaoSocial: "Nova", cpfCnpj: outroCpf }),
  )
  const id = (await created.json()).cliente.id
  assert.equal(
    (
      await s.router.editarHandler(
        request("PATCH", { cpfCnpj: cpf }),
        context(id),
      )
    ).status,
    409,
  )
  assert.equal(s.state.clientes.find((c) => c.id === id).cpf_cnpj, outroCpf)
  s.state.clientes.push({
    id: 80,
    id_empresa: 10,
    nome_razao_social: "PJ legada",
    cpf_cnpj: "12.abc.345/01de-35",
    status: "ATIVO",
  })
  assert.equal(
    (
      await s.router.criarHandler(
        request("POST", { nomeRazaoSocial: "PJ nova", cpfCnpj: alfanumerico }),
      )
    ).status,
    409,
  )
})

test("listagem filtra empresa, nome/documento/status e paginação com ordem estável", async () => {
  const s = setup()
  for (const [id, empresa, nome, doc, status] of [
    [1, 10, "Ana", cpf, "ATIVO"],
    [2, 10, "Ana", null, "INATIVO"],
    [3, 10, "Bia", "529.982.247-25", "ATIVO"],
    [4, 20, "Ana", cpf, "ATIVO"],
  ])
    s.state.clientes.push({
      id,
      id_empresa: empresa,
      nome_razao_social: nome,
      cpf_cnpj: doc,
      status,
    })
  const list = await s.router.listarHandler(
    request("GET", undefined, {}, "?pagina=2&limite=1"),
  )
  const data = await list.json()
  assert.deepEqual(data.paginacao, {
    pagina: 2,
    limite: 1,
    total: 3,
    totalPaginas: 3,
  })
  assert.deepEqual(
    data.clientes.map((c) => c.id),
    [2],
  )
  const filtered = await s.router.listarHandler(
    request("GET", undefined, {}, `?nome=Ana&cpfCnpj=${cpf}&status=ATIVO`),
  )
  assert.deepEqual(
    (await filtered.json()).clientes.map((c) => c.id),
    [1],
  )
  const legacy = await s.router.listarHandler(
    request("GET", undefined, {}, `?cpfCnpj=${cpf}`),
  )
  assert.deepEqual(
    (await legacy.json()).clientes.map((c) => c.id),
    [1, 3],
  )
  const empty = await s.router.listarHandler(
    request("GET", undefined, {}, `?cpfCnpj=${outroCpf}`),
  )
  assert.equal((await empty.json()).paginacao.total, 0)
})

test("permissões existentes e seleção de empresa: perfil sozinho não concede acesso", async () => {
  const s = setup()
  assert.equal(
    (
      await s.router.listarHandler(
        request("GET", undefined, { authorization: "" }),
      )
    ).status,
    401,
  )
  assert.equal(
    (
      await s.router.listarHandler(
        request("GET", undefined, { authorization: "Bearer invalid" }),
      )
    ).status,
    401,
  )
  s.token.role = "PRODUCAO"
  assert.equal((await s.router.listarHandler(request())).status, 403)
  s.token.role = "VENDAS"
  for (const [field, call] of [
    ["pode_ler", () => s.router.listarHandler(request())],
    [
      "pode_criar",
      () => s.router.criarHandler(request("POST", { nomeRazaoSocial: "Nome" })),
    ],
    [
      "pode_editar",
      () =>
        s.router.editarHandler(
          request("PATCH", { nomeRazaoSocial: "Nome" }),
          context(1),
        ),
    ],
    [
      "pode_excluir",
      () => s.router.excluirHandler(request("DELETE"), context(1)),
    ],
  ]) {
    s.permissao[field] = false
    assert.equal((await call()).status, 403, field)
    s.permissao[field] = true
  }
  assert.equal(
    (
      await s.router.listarHandler(
        request("GET", undefined, { "X-Empresa-Id": "20" }),
      )
    ).status,
    403,
  )
  s.vinculos.push({ ...s.vinculo, id_empresa: 20 })
  assert.equal((await s.router.listarHandler(request())).status, 400)
  assert.equal(
    (
      await s.router.listarHandler(
        request("GET", undefined, { "X-Empresa-Id": "10" }),
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await s.router.listarHandler(
        request("GET", undefined, { "X-Empresa-Id": "1e1" }),
      )
    ).status,
    403,
  )
  s.vinculos.pop()
  s.vinculo.permissoes_usuario = []
  s.token.role = "ADMINISTRACAO"
  assert.equal((await s.router.listarHandler(request())).status, 403)
  s.vinculo.usuarios.nivel_acesso = "ADMIN"
  assert.equal((await s.router.listarHandler(request())).status, 200)
  s.vinculo.usuarios.nivel_acesso = "USUARIO"
  s.vinculo.nivel_acesso = "EMPRESA"
  assert.equal((await s.router.listarHandler(request())).status, 200)
  s.vinculos.length = 0
  assert.equal((await s.router.listarHandler(request())).status, 403)
  assert.deepEqual(s.calls.find(([type]) => type === "memberships")[1].where, {
    id_usuario: 5,
    status: "ATIVO",
    empresas: { status: "ATIVA" },
    usuarios: { status: "ATIVO" },
  })
})

test("VENDAS inativa com pode_excluir; POST/PATCH não contornam essa permissão", async () => {
  const s = setup()
  await s.router.criarHandler(request("POST", { nomeRazaoSocial: "Nome" }))
  s.permissao.pode_excluir = false
  for (const response of [
    await s.router.criarHandler(
      request("POST", { nomeRazaoSocial: "Outro", status: "INATIVO" }),
    ),
    await s.router.editarHandler(
      request("PATCH", { status: "INATIVO" }),
      context(1),
    ),
    await s.router.excluirHandler(request("DELETE"), context(1)),
  ])
    assert.equal(response.status, 403)
  assert.equal(s.state.clientes[0].status, "ATIVO")
  assert.equal(
    (
      await s.router.editarHandler(
        request("PATCH", { telefone: "123" }),
        context(1),
      )
    ).status,
    200,
  )
  s.permissao.pode_excluir = true
  s.permissao.pode_editar = false
  assert.equal(
    (await s.router.excluirHandler(request("DELETE"), context(1))).status,
    200,
  )
})

test("histórico não vaza venda de outra empresa; mantém decimais, datas e pedidos após inativação", async () => {
  const s = setup()
  s.state.clientes.push({
    id: 1,
    id_empresa: 10,
    nome_razao_social: "Nome",
    cpf_cnpj: null,
    status: "INATIVO",
  })
  for (const [id, empresa, cliente] of [
    [10, 10, 1],
    [11, 10, 1],
    [12, 20, 1],
    [13, 10, 2],
  ])
    s.state.vendas.push({
      id,
      id_empresa: empresa,
      id_cliente: cliente,
      numero: `V${id}`,
      status: "CONFIRMADA",
      data_venda: new Date("2026-09-22T12:00:00Z"),
      data_entrega: null,
      valor_total: new runtime.Decimal("9999999999999.99"),
    })
  const route = s.load("src/app/api/clientes/[id]/pedidos/route.ts")
  const response = await route.GET(
    request("GET", undefined, {}, "?limite=1"),
    context(1),
  )
  const data = await response.json()
  assert.equal(data.paginacao.total, 2)
  assert.equal(data.pedidos[0].id, 11)
  assert.equal(data.pedidos[0].valor_total, "9999999999999.99")
  assert.equal(data.pedidos[0].data_venda, "2026-09-22T12:00:00.000Z")
  assert.equal((await route.GET(request(), context(2))).status, 404)
  s.state.vendas.length = 0
  assert.deepEqual(
    (await (await route.GET(request(), context(1))).json()).pedidos,
    [],
  )
})

test("IDs alheios retornam 404 em consulta, edição, exclusão e histórico", async () => {
  const s = setup()
  s.state.clientes.push({
    id: 2,
    id_empresa: 20,
    nome_razao_social: "Outra empresa",
    cpf_cnpj: cpf,
    status: "ATIVO",
  })
  for (const response of [
    await s.router.consultarHandler(request(), context(2)),
    await s.router.editarHandler(
      request("PATCH", { nomeRazaoSocial: "Invasão" }),
      context(2),
    ),
    await s.router.excluirHandler(request("DELETE"), context(2)),
    await s.router.pedidosHandler(request(), context(2)),
  ])
    assert.equal(response.status, 404)
  assert.equal(s.state.clientes[0].nome_razao_social, "Outra empresa")
  assert.equal(s.state.auditoria.length, 0)
})

test("HTTP: JSON inválido, parâmetros repetidos/desconhecidos e IDs inválidos retornam 400", async () => {
  const s = setup()
  const badJson = new Request("http://localhost", {
    method: "POST",
    headers: { authorization: "Bearer valid" },
    body: "{",
  })
  assert.equal((await s.router.criarHandler(badJson)).status, 400)
  for (const body of [null, [], {}, { nomeRazaoSocial: "Nome", idEmpresa: 20 }])
    assert.equal(
      (await s.router.criarHandler(request("POST", body))).status,
      400,
    )
  for (const id of ["0", "-1", "1.0", "1e1", "2147483648", "abc"])
    assert.equal(
      (await s.router.consultarHandler(request(), context(id))).status,
      400,
    )
  for (const search of [
    "?limite=101",
    "?pagina=1&pagina=2",
    "?idEmpresa=20",
    "?__proto__=x",
  ])
    assert.equal(
      (await s.router.listarHandler(request("GET", undefined, {}, search)))
        .status,
      400,
    )
})

test("500 não expõe query/stack; falha de auditoria desfaz cadastro e log recebe erro completo", async (t) => {
  const s = setup(),
    logs = []
  const error = new Error("SQL SELECT segredo; senha=secreta; stack interno")
  t.mock.method(console, "error", (...args) => logs.push(args))
  s.tx.auditoria.create = async () => {
    throw error
  }
  const response = await s.router.criarHandler(
    request("POST", { nomeRazaoSocial: "Nome" }),
  )
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "Erro interno" })
  assert.equal(response.headers.get("Cache-Control"), "no-store")
  assert.equal(logs[0][1], error)
  assert.equal(s.state.clientes.length, 0)
})

test("conflitos Prisma são 409; empresa inativa não permite gravação", async () => {
  for (const code of ["P2002", "P2034", "P2003", "P2004", "P2025"]) {
    const s = setup()
    s.prisma.$transaction = async () => {
      throw new runtime.PrismaClientKnownRequestError("query interna", {
        code,
        clientVersion: "7.10.0",
      })
    }
    const response = await s.router.criarHandler(
      request("POST", { nomeRazaoSocial: "Nome" }),
    )
    assert.equal(response.status, 409)
    assert.equal(
      JSON.stringify(await response.json()).includes("query interna"),
      false,
    )
  }
  const s = setup()
  s.state.empresaAtiva = false
  assert.equal(
    (await s.router.criarHandler(request("POST", { nomeRazaoSocial: "Nome" })))
      .status,
    403,
  )
  assert.equal(s.state.clientes.length, 0)
})
