import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import ts from "typescript"
const require = createRequire(import.meta.url)
const runtime = require("@prisma/client/runtime/client")
const { Decimal } = runtime

function setup(overrides = {}) {
  const cache = new Map()
  const calls = []
  const ordem = {
    id: 1,
    id_empresa: 10,
    id_setor: null,
    status: "PLANEJADA",
    quantidade_planejada: new Decimal(2),
    data_inicio: null,
    data_previsao: null,
    ordem_producao_item: [
      {
        id: 20,
        id_produto: 30,
        quantidade: new Decimal(2),
        ordem_producao_consumo_planejado: [{}],
      },
    ],
    ordem_producao_fluxo_setor: [],
    ordem_producao_movimentacao_setor: [],
  }
  const vinculo = {
    id_empresa: 10,
    nivel_acesso: "USUARIO",
    usuarios: { nivel_acesso: "USUARIO" },
    permissoes_usuario: [
      { recurso: "ORDENS_PRODUCAO", pode_criar: true, pode_editar: true },
    ],
  }
  const tx = {
    async $queryRaw(query) {
      const sql = (query.strings ?? query).join("?")
      if (sql.includes("FROM produto_fluxo")) return [{ id_fluxo: 3 }]
      if (sql.includes("FROM fluxo_producao_setor"))
        return [
          { id: 7, nome: "Corte", descricao: null, status: "ATIVO", ordem: 1 },
          {
            id: 8,
            nome: "Costura",
            descricao: null,
            status: "ATIVO",
            ordem: 2,
          },
        ]
      if (sql.includes("FROM fluxos_producao"))
        return [{ id: 3, nome: "Padrão", descricao: null, status: "ATIVO" }]
      return []
    },
    async $executeRaw(query, ...values) {
      calls.push(["sql", query.strings ? query : { strings: query, values }])
      return 1
    },
    ordem_producao: {
      async findFirst({ where }) {
        return where.id_empresa === 10 && where.id === 1 ? ordem : null
      },
      async updateMany(args) {
        calls.push(["update", args])
        return { count: 1 }
      },
    },
    ordem_producao_item: {
      async update(args) {
        calls.push(["item", args])
      },
    },
    ordem_producao_consumo_planejado: {
      async deleteMany(args) {
        calls.push(["delete-consumo", args])
      },
      async createMany(args) {
        calls.push(["consumo", args])
      },
    },
    produto_empresa: {
      async findUnique() {
        return { id: 1 }
      },
      async findFirst() {
        return {}
      },
      async count() {
        return 1
      },
    },
    ficha_tecnica: {
      async findFirst() {
        calls.push(["ficha"])
        return {
          ficha_tecnica_item: [
            {
              id_produto_componente: 50,
              quantidade: new Decimal("0.125"),
              perda_percentual: new Decimal(80),
            },
          ],
        }
      },
    },
    setores: {
      async findFirst() {
        return {}
      },
    },
    auditoria: {
      async create(args) {
        calls.push(["auditoria", args])
      },
    },
    ordem_producao_movimentacao_setor: {
      async create(args) {
        calls.push(["movimento", args])
      },
    },
  }
  const prisma = {
    usuario_empresa: {
      async findMany(args) {
        calls.push(["vinculos", args])
        return [vinculo]
      },
    },
    async $transaction(fn, config) {
      calls.push(["transaction", config])
      return fn(tx)
    },
  }
  function load(file) {
    file = path.resolve(file)
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
      if (Object.hasOwn(overrides, id)) return overrides[id]
      if (id === "server-only") return {}
      if (id === "@/generated/prisma/client")
        return { Prisma: { ...runtime, sql: runtime.sqltag } }
      if (id === "@/lib/prisma") return { prisma }
      if (id === "@/lib/authorize")
        return {
          requireRole: async () => ({ user: { id: 5, role: "PRODUCAO" } }),
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
    load,
    calls,
    ordem,
    tx,
    prisma,
    vinculo,
    service: load("src/modules/producao/producao.service.ts"),
  }
}
const ctx = { idUsuario: 5, idEmpresa: 10 }
const conflict = (error) => error.status === 409

test("cálculo decimal exato, sem perda, arredondamento e limites", () => {
  const { service } = setup()
  const item = (q) => [
    {
      id_produto_componente: 4,
      quantidade: new Decimal(q),
      perda_percentual: new Decimal(90),
    },
  ]
  assert.equal(
    service
      .calcularInsumos("3", item("0.125"))[0]
      .quantidade_necessaria.toString(),
    "0.375",
  )
  assert.equal(
    service
      .calcularInsumos("1.5", item("0.001"))[0]
      .quantidade_necessaria.toString(),
    "0.002",
  )
  for (const q of ["0", "-1", "999999999999.999"])
    assert.throws(
      () => service.calcularInsumos("2", item(q)),
      (error) => error.status === 400,
    )
})

test("schema rejeita campos desconhecidos, quantidades inválidas e setores repetidos", () => {
  const { load } = setup()
  const { abrirSchema, avancarSchema } = load(
    "src/modules/producao/producao.schema.ts",
  )
  for (const quantidade of [0, -1, "1.0001", "1e3", "1000000000000", "NaN"])
    assert.equal(
      abrirSchema.safeParse({ idProduto: 1, quantidade }).success,
      false,
    )
  for (const extra of [
    { id_empresa: 8 },
    { setores: [1, 1] },
    { observacao: "a".repeat(256) },
  ])
    assert.equal(
      abrirSchema.safeParse({ idProduto: 1, quantidade: "2", ...extra })
        .success,
      false,
    )
  assert.equal(
    avancarSchema.safeParse({
      statusEsperado: "LIBERADA",
      statusDestino: "EM_PRODUCAO",
    }).success,
    false,
  )
})

test("empresa sempre validada contra vínculo ativo, inclusive para ADMIN", async () => {
  const { load, calls, vinculo, prisma } = setup()
  const { autorizar } = load("src/modules/producao/producao.authorization.ts")
  const req = (id) =>
    new Request("http://localhost", {
      headers: id === undefined ? {} : { "X-Empresa-Id": id },
    })
  assert.deepEqual(await autorizar(req("10"), "criar"), ctx)
  assert.deepEqual(calls[0][1].where, {
    id_usuario: 5,
    status: "ATIVO",
    empresas: { status: "ATIVA" },
    usuarios: { status: "ATIVO" },
  })
  vinculo.usuarios.nivel_acesso = "ADMIN"
  for (const id of ["99", "0", "abc", "1e1"])
    await assert.rejects(autorizar(req(id), "criar"), (e) => e.status === 403)
  prisma.usuario_empresa.findMany = async () => [
    vinculo,
    { ...vinculo, id_empresa: 11 },
  ]
  await assert.rejects(autorizar(req(), "editar"), (e) => e.status === 400)
  prisma.usuario_empresa.findMany = async () => []
  await assert.rejects(autorizar(req("10"), "editar"), (e) => e.status === 403)
})

test("permissões de criar/editar são verificadas na empresa selecionada", async () => {
  const { load, vinculo } = setup()
  vinculo.permissoes_usuario[0].pode_editar = false
  const { autorizar } = load("src/modules/producao/producao.authorization.ts")
  await assert.rejects(
    autorizar(new Request("http://localhost"), "editar"),
    (e) => e.status === 403,
  )
  assert.deepEqual(
    await autorizar(new Request("http://localhost"), "criar"),
    ctx,
  )
})

test("produto/quantidade só podem mudar em PLANEJADA; observação não recalcula", async () => {
  const { service, ordem, calls } = setup()
  await service.alterarOrdem(ctx, 1, {
    statusEsperado: "PLANEJADA",
    quantidade: "3",
  })
  assert.equal(
    calls
      .find(([kind]) => kind === "consumo")[1]
      .data[0].quantidade_necessaria.toString(),
    "0.375",
  )
  for (const status of [
    "AGUARDANDO_MATERIAL",
    "LIBERADA",
    "EM_PRODUCAO",
    "PAUSADA",
  ]) {
    ordem.status = status
    await assert.rejects(
      service.alterarOrdem(ctx, 1, { statusEsperado: status, quantidade: "4" }),
      conflict,
    )
    await assert.rejects(
      service.alterarOrdem(ctx, 1, { statusEsperado: status, idProduto: 77 }),
      conflict,
    )
    calls.length = 0
    await service.alterarOrdem(ctx, 1, {
      statusEsperado: status,
      observacao: "Nota",
    })
    assert.equal(
      calls.some(([kind]) =>
        ["ficha", "consumo", "delete-consumo"].includes(kind),
      ),
      false,
    )
  }
})

test("lock otimista inclui status, empresa e setor; falha não gera histórico", async () => {
  const { service, ordem, tx, calls } = setup()
  ordem.status = "EM_PRODUCAO"
  ordem.id_setor = 7
  ordem.ordem_producao_fluxo_setor = [{ id_setor: 7 }, { id_setor: 8 }]
  tx.ordem_producao.updateMany = async (args) => {
    calls.push(["update", args])
    return { count: 0 }
  }
  await assert.rejects(
    service.avancarOrdem(ctx, 1, {
      statusEsperado: "EM_PRODUCAO",
      setorEsperado: 7,
      statusDestino: "EM_PRODUCAO",
    }),
    conflict,
  )
  assert.deepEqual(calls.find(([kind]) => kind === "update")[1].where, {
    id: 1,
    id_empresa: 10,
    status: "EM_PRODUCAO",
    id_setor: 7,
  })
  assert.equal(
    calls.some(([kind]) => kind === "movimento" || kind === "auditoria"),
    false,
  )
})

test("encerramento exige último setor e histórico completo; informa estoque pendente", async () => {
  const { service, ordem, calls } = setup()
  ordem.status = "EM_PRODUCAO"
  ordem.data_inicio = new Date()
  ordem.id_setor = 8
  ordem.ordem_producao_fluxo_setor = [{ id_setor: 7 }, { id_setor: 8 }]
  const input = { statusEsperado: "EM_PRODUCAO", setorEsperado: 8 }
  await assert.rejects(service.encerrarOrdem(ctx, 1, input), conflict)
  ordem.ordem_producao_movimentacao_setor = [
    {
      id: 1,
      id_setor_origem: null,
      id_setor_destino: 7,
      status: "ENTREGUE",
      data_recebimento: new Date(),
    },
    {
      id: 2,
      id_setor_origem: 7,
      id_setor_destino: 8,
      status: "ENTREGUE",
      data_recebimento: new Date(),
    },
  ]
  const result = await service.encerrarOrdem(ctx, 1, input)
  assert.equal(result.baixaEstoque, "pendente")
  assert.equal(result.perdaAplicada, false)
  assert.equal(
    calls.find(([kind]) => kind === "update")[1].data.status,
    "CONCLUIDA",
  )
  ordem.ordem_producao_movimentacao_setor[1].status = "EM_TRANSITO"
  await assert.rejects(service.encerrarOrdem(ctx, 1, input), conflict)
})

test("ordem de outra empresa retorna 404; transição direta a produção retorna 409", async () => {
  const { service } = setup()
  await assert.rejects(
    service.alterarOrdem({ ...ctx, idEmpresa: 11 }, 1, {
      statusEsperado: "PLANEJADA",
      observacao: "x",
    }),
    (e) => e.status === 404,
  )
  await assert.rejects(
    service.avancarOrdem(ctx, 1, {
      statusEsperado: "PLANEJADA",
      setorEsperado: null,
      statusDestino: "EM_PRODUCAO",
    }),
    conflict,
  )
})

test("HTTP: JSON inválido, validação e conflito usam { error }", async () => {
  const { load } = setup()
  const router = load("src/modules/producao/router.ts")
  const req = (body) =>
    new Request("http://localhost/api/ordens-producao", {
      method: "POST",
      body,
    })
  for (const body of ["{", JSON.stringify({ idProduto: 1, quantidade: 0 })]) {
    const response = await router.abrirHandler(req(body))
    assert.equal(response.status, 400)
    assert.equal(typeof (await response.json()).error, "string")
  }
  const response = await router.avancarHandler(
    req(
      JSON.stringify({
        statusEsperado: "LIBERADA",
        setorEsperado: null,
        statusDestino: "EM_PRODUCAO",
      }),
    ),
    { params: Promise.resolve({ id: "1" }) },
  )
  assert.equal(response.status, 409)
})

test("abertura persiste ficha, sequência e auditoria na transação; HTTP 201", async () => {
  const { load, tx, calls, ordem } = setup()
  tx.setores.count = async () => 2
  tx.sequencias_automaticas = {
    async upsert(args) {
      calls.push(["sequencia", args])
      return { ultimo_numero: 42n }
    },
  }
  tx.ordem_producao.create = async (args) => {
    calls.push(["abertura", args])
    return ordem
  }
  const response = await load("src/modules/producao/router.ts").abrirHandler(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ idProduto: 30, quantidade: "2" }),
    }),
  )
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.perdaAplicada, false)
  const data = calls.find(([kind]) => kind === "abertura")[1].data
  assert.equal(data.numero, "42")
  assert.equal(data.id_usuario, 5)
  assert.equal(data.id_empresa, 10)
  assert.deepEqual(data.ordem_producao_fluxo_setor.create, [
    { id_setor: 7, ordem: 1 },
    { id_setor: 8, ordem: 2 },
  ])
  assert.equal(
    calls
      .find(([kind]) => kind === "consumo")[1]
      .data[0].quantidade_necessaria.toString(),
    "0.25",
  )
  assert.equal(
    calls.find(([kind]) => kind === "auditoria")[1].data.acao,
    "INSERT",
  )
})

test("ficha ausente ou componente sem vínculo impede abertura antes de persistir", async () => {
  const { service, tx, calls } = setup()
  tx.produto_empresa.count = async () => 0
  const input = {
    idProduto: 30,
    quantidade: "2",
    setores: [],
    tamanho: "UNICO",
  }
  await assert.rejects(service.abrirOrdem(ctx, input), (e) => e.status === 400)
  tx.ficha_tecnica.findFirst = async () => null
  await assert.rejects(service.abrirOrdem(ctx, input), (e) => e.status === 400)
  assert.equal(
    calls.some(([kind]) => kind === "consumo" || kind === "auditoria"),
    false,
  )
})

test("conflito de serialização do banco retorna 409 sem repetição automática", async () => {
  const { service, prisma } = setup()
  let attempts = 0
  prisma.$transaction = async () => {
    attempts++
    throw new runtime.PrismaClientKnownRequestError("write conflict", {
      code: "P2034",
      clientVersion: "test",
    })
  }
  await assert.rejects(
    service.avancarOrdem(ctx, 1, {
      statusEsperado: "PLANEJADA",
      setorEsperado: null,
      statusDestino: "LIBERADA",
    }),
    conflict,
  )
  assert.equal(attempts, 1)
})

test("abertura exige fluxo (422) e rejeita setores enviados manualmente", async () => {
  const { service, tx, load } = setup()
  tx.$queryRaw = async () => []
  await assert.rejects(
    service.abrirOrdem(ctx, {
      idProduto: 30,
      quantidade: "2",
      tamanho: "UNICO",
    }),
    (e) => e.status === 422 && /fluxo/.test(e.message),
  )
  const schema = load("src/modules/producao/producao.schema.ts").abrirSchema
  assert.equal(
    schema.safeParse({ idProduto: 30, quantidade: "2", setores: [7] }).success,
    false,
  )
})

test("snapshot copia nomes e sequência e é gravado na transação de abertura", async () => {
  const { service, tx, calls, ordem } = setup()
  tx.sequencias_automaticas = { upsert: async () => ({ ultimo_numero: 1n }) }
  tx.ordem_producao.create = async () => ordem
  await service.abrirOrdem(ctx, {
    idProduto: 30,
    quantidade: "2",
    tamanho: "UNICO",
  })
  const query = calls.find(
    ([kind, value]) =>
      kind === "sql" &&
      value.strings.join("").includes("INSERT INTO ordem_producao_snapshot"),
  )[1]
  assert.deepEqual(JSON.parse(query.values[2]), {
    fluxoId: 3,
    nome: "Padrão",
    descricao: null,
    setores: [
      { id: 7, nome: "Corte", descricao: null, ordem: 1 },
      { id: 8, nome: "Costura", descricao: null, ordem: 2 },
    ],
  })
  assert.equal(calls[0][1].isolationLevel, "Serializable")
})

function setupEtapas() {
  const state = setup()
  const etapas = [
    {
      id: 101,
      id_setor: 7,
      ordem: 1,
      status: "PENDENTE",
      data_inicio: null,
      data_conclusao: null,
    },
    {
      id: 102,
      id_setor: 8,
      ordem: 2,
      status: "PENDENTE",
      data_inicio: null,
      data_conclusao: null,
    },
  ]
  const snapshot = {
    fluxoId: 3,
    nome: "Original",
    descricao: null,
    setores: [
      { id: 7, nome: "Corte", ordem: 1 },
      { id: 8, nome: "Costura", ordem: 2 },
    ],
  }
  state.tx.$queryRaw = async (query) =>
    (query.strings ?? query).join("").includes("ordem_producao_snapshot")
      ? [{ snapshot }]
      : etapas.map((e) => ({ ...e }))
  state.tx.$executeRaw = async (query, ...values) => {
    const etapa = etapas.find(
      (e) => e.id === (query.strings ? query.values : values)[0],
    )
    const iniciar = (query.strings ?? query)
      .join("")
      .includes("SET status = 'EM_PRODUCAO'")
    if (!etapa || etapa.status !== (iniciar ? "PENDENTE" : "EM_PRODUCAO"))
      return 0
    etapa.status = iniciar ? "EM_PRODUCAO" : "CONCLUIDA"
    return 1
  }
  state.tx.ordem_producao.updateMany = async ({ data }) => {
    Object.assign(state.ordem, data)
    return { count: 1 }
  }
  state.ordem.status = "LIBERADA"
  return { ...state, etapas, snapshot }
}

test("etapas respeitam sequência, início obrigatório, pausa e término automático", async () => {
  const { service, ordem, etapas } = setupEtapas()
  await assert.rejects(service.executarEtapa(ctx, 1, 102, true), conflict)
  await assert.rejects(service.executarEtapa(ctx, 1, 101, false), conflict)
  await service.executarEtapa(ctx, 1, 101, true)
  assert.equal(ordem.status, "EM_PRODUCAO")
  await assert.rejects(service.executarEtapa(ctx, 1, 101, true), conflict)
  await assert.rejects(service.executarEtapa(ctx, 1, 102, false), conflict)
  ordem.status = "PAUSADA"
  await assert.rejects(service.executarEtapa(ctx, 1, 101, false), conflict)
  ordem.status = "EM_PRODUCAO"
  await service.executarEtapa(ctx, 1, 101, false)
  assert.equal(ordem.status, "EM_PRODUCAO")
  await assert.rejects(service.executarEtapa(ctx, 1, 101, false), conflict)
  await service.executarEtapa(ctx, 1, 102, true)
  await service.executarEtapa(ctx, 1, 102, false)
  assert.equal(ordem.status, "CONCLUIDA")
  assert.ok(etapas.every((e) => e.status === "CONCLUIDA"))
  await assert.rejects(service.executarEtapa(ctx, 1, 102, false), conflict)
})

test("rotas legadas e troca de produto não contornam snapshot; GET preserva histórico", async () => {
  const { service, ordem, snapshot } = setupEtapas()
  await assert.rejects(
    service.avancarOrdem(ctx, 1, {
      statusEsperado: "LIBERADA",
      setorEsperado: null,
      statusDestino: "EM_PRODUCAO",
    }),
    conflict,
  )
  ordem.status = "PLANEJADA"
  await assert.rejects(
    service.alterarOrdem(ctx, 1, {
      statusEsperado: "PLANEJADA",
      idProduto: 99,
    }),
    conflict,
  )
  ordem.status = "EM_PRODUCAO"
  ordem.data_inicio = new Date()
  await assert.rejects(
    service.encerrarOrdem(ctx, 1, {
      statusEsperado: "EM_PRODUCAO",
      setorEsperado: null,
    }),
    conflict,
  )
  const result = await service.consultarOrdem(ctx, 1)
  assert.deepEqual(result.fluxoSnapshot, snapshot)
  await assert.rejects(
    service.consultarOrdem({ ...ctx, idEmpresa: 11 }, 1),
    (e) => e.status === 404,
  )
})

test("conflito na gravação da etapa impede atualizar a ordem e auditar", async () => {
  const { service, tx, calls } = setupEtapas()
  tx.$executeRaw = async () => 0
  await assert.rejects(service.executarEtapa(ctx, 1, 101, true), conflict)
  assert.equal(
    calls.some(([kind]) => ["update", "auditoria", "movimento"].includes(kind)),
    false,
  )
})

test("schemas de cadastro validam ordem, duplicação, paginação e booleanos", () => {
  const { load } = setup()
  const { fluxoSchema, setorSchema, listarSchema, editarFluxoSchema } = load(
    "src/modules/fluxos/fluxos.schema.ts",
  )
  for (const setores of [
    [],
    [1, 1],
    [0],
    Array.from({ length: 101 }, (_, i) => i + 1),
  ])
    assert.equal(
      fluxoSchema.safeParse({ nome: "Fluxo", setores }).success,
      false,
    )
  assert.deepEqual(
    fluxoSchema.parse({ nome: " Fluxo ", setores: [8, 7] }).setores,
    [8, 7],
  )
  assert.equal(
    setorSchema.safeParse({ nome: "Corte", ativo: "false" }).success,
    false,
  )
  assert.equal(editarFluxoSchema.safeParse({}).success, false)
  for (const query of [
    { pagina: "0" },
    { limite: "101" },
    { status: "qualquer" },
    { desconhecido: "x" },
  ])
    assert.equal(listarSchema.safeParse(query).success, false)
})

test("CRUD e associação validam empresa, setores ativos, vínculos e transações", async () => {
  const data = {
    id: 3,
    nome: "Padrão",
    descricao: null,
    status: "ATIVO",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  let uso = false
  let ativo = true
  let empresa = 10
  let associado = null
  const writes = []
  const repo = {
    buscar: async (_tx, ctx, tipo, id) => {
      if (ctx.idEmpresa !== empresa) {
        const e = new Error("Não encontrado")
        e.status = 404
        throw e
      }
      return {
        ...data,
        id,
        status: tipo === "setor" && !ativo ? "INATIVO" : "ATIVO",
      }
    },
    listar: async () => ({ rows: [data], total: 1 }),
    setoresFluxo: async () => [
      { ...data, id: 8, ordem: 1 },
      { ...data, id: 7, ordem: 2 },
    ],
    gravar: async (...args) => {
      writes.push(["gravar", ...args])
      return 3
    },
    substituirSetores: async (_tx, id, setores) =>
      writes.push(["setores", id, setores]),
    auditarCadastro: async () => {},
    produtosDoFluxo: async () => [],
    associacao: async () => associado,
    emUso: async () => uso,
    remover: async () => writes.push(["remover"]),
    produto: async (_tx, ctx) => {
      if (ctx.idEmpresa !== empresa) {
        const e = new Error("Não encontrado")
        e.status = 404
        throw e
      }
      return { id: 50 }
    },
    associar: async (_tx, ctx, id, fluxoId) => {
      associado = fluxoId
      writes.push(["associar", ctx.idEmpresa, id, fluxoId])
    },
  }
  const { load, calls } = setup({ "./fluxos.repository": repo })
  const service = load("src/modules/fluxos/fluxos.service.ts")
  const saved = await service.salvar(ctx, "fluxo", {
    nome: "Novo",
    setores: [8, 7],
  })
  assert.deepEqual(
    saved.fluxo.setores.map((s) => s.id),
    [8, 7],
  )
  assert.deepEqual(
    writes.find(([kind]) => kind === "setores"),
    ["setores", 3, [8, 7]],
  )
  assert.ok(
    calls.every(
      ([kind, value]) =>
        kind !== "transaction" || value.isolationLevel === "Serializable",
    ),
  )
  const list = await service.listar(ctx, "fluxo", { pagina: 1, limite: 20 })
  assert.equal(list.paginacao.total, 1)
  ativo = false
  await assert.rejects(
    service.salvar(ctx, "fluxo", { nome: "Inválido", setores: [7] }),
    (e) => e.status === 422,
  )
  uso = true
  for (const tipo of ["setor", "fluxo"])
    await assert.rejects(service.excluir(ctx, tipo, 3), conflict)
  uso = false
  await service.excluir(ctx, "fluxo", 3)
  await service.associar(ctx, 30, 3)
  await service.associar(ctx, 30, null)
  assert.deepEqual(writes.at(-1), ["associar", 10, 30, null])
  empresa = 11
  await assert.rejects(service.associar(ctx, 30, 3), (e) => e.status === 404)
})

test("CRUD HTTP usa permissões de ler/excluir e produto usa recurso PRODUTOS", async () => {
  const { load, vinculo } = setup()
  const { handler } = load("src/modules/fluxos/router.ts")
  const req = new Request("http://localhost/api/setores")
  assert.equal((await handler("setor", "listar")(req)).status, 403)
  assert.equal(
    (
      await handler("setor", "excluir")(req, {
        params: Promise.resolve({ id: "3" }),
      })
    ).status,
    403,
  )
  vinculo.permissoes_usuario[0].pode_editar = true
  assert.equal(
    (
      await handler("fluxo", "associar")(
        new Request("http://localhost", {
          method: "PUT",
          body: '{"fluxoId":3}',
        }),
        { params: Promise.resolve({ id: "30" }) },
      )
    ).status,
    403,
  )
})

test("SQL de listagem parametriza filtros, empresa e paginação", async () => {
  const { load, tx } = setup()
  const queries = []
  tx.$queryRaw = async (query) => {
    queries.push(query)
    return query.strings.join("").includes("COUNT(*)") ? [{ total: 0n }] : []
  }
  const repo = load("src/modules/fluxos/fluxos.repository.ts")
  const nome = "' OR 1=1 --"
  await repo.listar(tx, ctx, "setor", {
    nome,
    status: "INATIVO",
    pagina: 2,
    limite: 10,
  })
  assert.equal(queries[0].sql.includes(nome), false)
  assert.deepEqual(queries[0].values, [10, nome, "INATIVO", 10, 10])
  assert.match(queries[0].sql, /ORDER BY nome, id/)
})

test("erros SQL de unicidade, FK e concorrência retornam 409", async () => {
  const { load, prisma } = setup()
  const { transacao } = load("src/modules/producao/producao.repository.ts")
  for (const code of ["1062", "1451", "1452", "1213", "1205"]) {
    prisma.$transaction = async () => {
      throw new runtime.PrismaClientKnownRequestError("SQL failure", {
        code: "P2010",
        clientVersion: "test",
        meta: { code },
      })
    }
    await assert.rejects(
      transacao(async () => null),
      conflict,
    )
  }
})

test("CRUD HTTP: respostas 201/200/204 e rejeição de JSON/query inválidos", async () => {
  const overrides = {}
  const { load, vinculo } = setup(overrides)
  const { ProducaoError } = load("src/modules/producao/producao.repository.ts")
  vinculo.usuarios.nivel_acesso = "ADMIN"
  let failure = false
  overrides["./fluxos.service"] = {
    salvar: async (_ctx, tipo, input) => ({ [tipo]: { id: 7, ...input } }),
    consultar: async () => ({ setor: { id: 7, nome: "Corte" } }),
    listar: async () => ({
      setores: [],
      paginacao: { pagina: 1, limite: 20, total: 0, totalPaginas: 0 },
    }),
    excluir: async () => {
      if (failure) throw new ProducaoError(409, "Vinculado")
    },
    associar: async (_ctx, id, fluxoId) => ({ produto: { id, fluxoId } }),
  }
  const { handler } = load("src/modules/fluxos/router.ts")
  const context = { params: Promise.resolve({ id: "7" }) }
  const req = (body, query = "") =>
    new Request(`http://localhost/api/setores${query}`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  const created = await handler("setor", "criar")(req({ nome: "Corte" }))
  assert.equal(created.status, 201)
  assert.deepEqual(await created.json(), { setor: { id: 7, nome: "Corte" } })
  assert.equal(created.headers.get("cache-control"), "no-store")
  for (const operation of ["consultar", "listar"])
    assert.equal(
      (await handler("setor", operation)(req(), context)).status,
      200,
    )
  assert.equal(
    (await handler("setor", "editar")(req({ ativo: false }), context)).status,
    200,
  )
  const deleted = await handler("setor", "excluir")(req(), context)
  assert.equal(deleted.status, 204)
  assert.equal(await deleted.text(), "")
  assert.equal(
    (await handler("fluxo", "associar")(req({ fluxoId: 3 }), context)).status,
    200,
  )
  assert.equal(
    (await handler("fluxo", "desassociar")(req(), context)).status,
    204,
  )
  failure = true
  assert.equal((await handler("setor", "excluir")(req(), context)).status, 409)
  assert.equal((await handler("setor", "criar")(req("{"))).status, 400)
  assert.equal(
    (await handler("setor", "listar")(req(undefined, "?pagina=1&pagina=2")))
      .status,
    400,
  )
  assert.equal(
    (
      await handler("setor", "consultar")(req(), {
        params: Promise.resolve({ id: "1e1" }),
      })
    ).status,
    400,
  )
})

test("inativar setor não impede pausar/retomar OP com snapshot", async () => {
  const { service, tx, ordem } = setupEtapas()
  await service.executarEtapa(ctx, 1, 101, true)
  tx.setores.findFirst = async () => null
  await service.avancarOrdem(ctx, 1, {
    statusEsperado: "EM_PRODUCAO",
    setorEsperado: 7,
    statusDestino: "PAUSADA",
  })
  assert.equal(ordem.status, "PAUSADA")
  await service.avancarOrdem(ctx, 1, {
    statusEsperado: "PAUSADA",
    setorEsperado: 7,
    statusDestino: "EM_PRODUCAO",
  })
  assert.equal(ordem.status, "EM_PRODUCAO")
  await service.executarEtapa(ctx, 1, 101, false)
})

test("Prisma 7: DriverAdapterError real e encapsulado são conflitos; schema/conexão não", async () => {
  const { DriverAdapterError } = require("@prisma/driver-adapter-utils")
  const { load, prisma } = setup()
  const { transacao } = load("src/modules/producao/producao.repository.ts")
  for (const cause of [
    {
      kind: "UniqueConstraintViolation",
      originalCode: "1062",
      constraint: { index: "uk_nome" },
    },
    {
      kind: "ForeignKeyConstraintViolation",
      originalCode: "1451",
      constraint: { fields: ["id_setor"] },
    },
    { kind: "TransactionWriteConflict", originalCode: "1213" },
    {
      kind: "mysql",
      code: 1205,
      originalCode: "1205",
      message: "Lock timeout",
      state: "HY000",
    },
  ]) {
    const adapterError = new DriverAdapterError(cause)
    for (const error of [
      adapterError,
      new runtime.PrismaClientKnownRequestError("raw failure", {
        code: "P2010",
        clientVersion: "7.10.0",
        meta: { driverAdapterError: adapterError },
      }),
    ]) {
      prisma.$transaction = async () => {
        throw error
      }
      await assert.rejects(
        transacao(async () => null),
        conflict,
      )
    }
  }
  for (const cause of [
    { kind: "ColumnNotFound", originalCode: "1054", column: "ausente" },
    { kind: "TableDoesNotExist", originalCode: "1146", table: "ausente" },
    { kind: "ConnectionClosed", originalCode: "2006" },
  ]) {
    const error = new DriverAdapterError(cause)
    prisma.$transaction = async () => {
      throw error
    }
    await assert.rejects(
      transacao(async () => null),
      (e) => e === error,
    )
  }
})

test("GET fluxo do produto usa pode_ler de PRODUTOS e retorna null sem associação", async () => {
  const { load, vinculo, tx } = setup()
  const router = load("src/modules/fluxos/router.ts")
  const request = new Request("http://localhost/api/produtos/30/fluxo")
  const context = { params: Promise.resolve({ id: "30" }) }
  assert.equal(
    (await router.handler("fluxo", "consultarAssociacao")(request, context))
      .status,
    403,
  )
  vinculo.permissoes_usuario.push({
    recurso: "PRODUTOS",
    pode_ler: true,
    pode_editar: false,
  })
  tx.$queryRaw = async () => []
  const response = await router.handler("fluxo", "consultarAssociacao")(
    request,
    context,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    produto: { id: 30, fluxoId: null },
    fluxo: null,
  })
  tx.produto_empresa.findUnique = async () => null
  assert.equal(
    (await router.handler("fluxo", "consultarAssociacao")(request, context))
      .status,
    404,
  )
})
