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
      if (id === "@/generated/prisma/client") return { Prisma: runtime }
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
      body: JSON.stringify({ idProduto: 30, quantidade: "2", setores: [7, 8] }),
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
