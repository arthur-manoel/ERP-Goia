import { test } from "node:test"
import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { createServer } from "node:net"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"

const databaseUrl = process.env.ESTOQUE_API_TEST_DATABASE_URL

function carregarTypescript() {
  return registerHooks({
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
          source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          }).outputText,
        }
      return next(url, context)
    },
  })
}

async function iniciarHttp() {
  assert.ok(
    existsSync(path.resolve(".next/BUILD_ID")),
    "Execute npm run build antes da integração HTTP.",
  )
  const socket = createServer()
  socket.listen(0, "127.0.0.1")
  await once(socket, "listening")
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
      windowsHide: true,
    },
  )
  let erroInicio
  server.on("error", (error) => {
    erroInicio = error
  })
  const base = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 60000
    while (Date.now() < deadline) {
      if (erroInicio) throw erroInicio
      assert.equal(
        server.exitCode,
        null,
        "O build encerrou antes de atender HTTP.",
      )
      try {
        const result = await fetch(base + "/api/estoque", {
          signal: AbortSignal.timeout(2000),
        })
        await result.body?.cancel()
        if (result.status === 401) return { server, base }
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error
        // O processo ainda está iniciando; prazo global limitado acima.
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error("O servidor não ficou pronto em 60s.")
  } catch (error) {
    server.kill()
    throw error
  }
}

test("API de estoque: banco isolado e HTTP autenticado de produção", async (t) => {
  assert.ok(
    databaseUrl,
    "Defina ESTOQUE_API_TEST_DATABASE_URL; teste sem banco não é aprovação.",
  )
  const url = new URL(databaseUrl)
  assert.equal(url.protocol, "mysql:")
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Somente banco local.",
  )
  assert.match(
    url.pathname,
    /^\/[a-zA-Z0-9_]+_test$/,
    "Use banco dedicado com sufixo _test.",
  )
  process.env.DATABASE_URL = databaseUrl
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  delete process.env.DEV_ID_USUARIO
  delete process.env.DEV_ID_EMPRESA
  const hooks = carregarTypescript()
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = []
  let prisma, server
  try {
    ;({ prisma } = await import("../src/lib/prisma.ts"))
    const { Prisma } = await import("../src/generated/prisma/client.ts")
    for (const model of Object.values(Prisma.ModelName))
      assert.equal(
        await prisma[model].count(),
        0,
        `O banco precisa estar vazio: ${model}`,
      )
    const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
    const { criarVinculoEstoque, listarEstoque } =
      await import("../src/modules/estoque/estoque.repository.ts")
    const { filtrosEstoqueSchema } =
      await import("../src/modules/estoque/estoque.schema.ts")
    const marker = randomUUID().slice(0, 8)
    const password = randomBytes(24).toString("hex")
    const senha = await hashPassword(password)
    const cargos = [],
      locais = [],
      setores = [],
      leitores = [],
      vinculos = []
    for (let i = 0; i < 2; i++) {
      empresas.push(
        (
          await prisma.empresas.create({
            data: {
              razao_social: `Empresa estoque ${marker} ${i}`,
              cnpj: `${Date.now()}${i}`,
            },
          })
        ).id,
      )
      cargos.push(
        await prisma.cargos.create({
          data: { id_empresa: empresas[i], nome: "PRODUCAO" },
        }),
      )
    }
    const flags = [
      null,
      { pode_ler: true },
      { pode_criar: true },
      { pode_editar: true },
      {},
      null,
    ]
    for (let i = 0; i < flags.length; i++) {
      const usuario = await prisma.usuarios.create({
        data: {
          nome: `API estoque ${i}`,
          email: `${marker}-${i}@estoque.example.test`,
          senha,
          nivel_acesso: flags[i] === null ? "ADMIN" : "USUARIO",
        },
      })
      usuarios.push(usuario.id)
      leitores.push(usuario)
      const empresa = i === 5 ? 1 : 0
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_usuario: usuario.id,
          id_empresa: empresas[empresa],
          id_cargo: cargos[empresa].id,
        },
      })
      vinculos.push(vinculo)
      if (flags[i])
        await prisma.permissoes_usuario.create({
          data: {
            id_usuario_empresa: vinculo.id,
            recurso: "ESTOQUE",
            ...flags[i],
          },
        })
    }
    for (const [empresa, nome, status] of [
      [0, "Centro", "ATIVO"],
      [0, "Norte", "ATIVO"],
      [0, "Legado", "INATIVO"],
      [1, "SEGREDO LOCAL B", "ATIVO"],
    ])
      locais.push(
        await prisma.locais_estoque.create({
          data: {
            id_empresa: empresas[empresa],
            nome: `${nome} ${marker}`,
            status,
          },
        }),
      )
    for (const [empresa, nome, status] of [
      [0, "Centro", "ATIVO"],
      [0, "Norte", "ATIVO"],
      [0, "Legado", "INATIVO"],
      [1, "SEGREDO SETOR B", "ATIVO"],
      [0, "Auxiliar", "ATIVO"],
    ])
      setores.push(
        await prisma.setores.create({
          data: {
            id_empresa: empresas[empresa],
            nome: `${nome} ${marker}`,
            status,
          },
        }),
      )
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Tipo API estoque ${marker}` },
    })
    tipos.push(tipo.id)
    async function produto(nome, options = {}) {
      const {
        empresa = 0,
        habilitado = true,
        statusNaEmpresa = "ATIVO",
        ...campos
      } = options
      const p = await prisma.produtos.create({
        data: {
          nome,
          codigo: `${marker}-${produtos.length}`,
          unidade: "UN",
          id_tipo_produto: tipo.id,
          ...campos,
        },
      })
      produtos.push(p.id)
      if (habilitado)
        await prisma.produto_empresa.create({
          data: {
            id_empresa: empresas[empresa],
            id_produto: p.id,
            codigo_interno: `INTERNO-${p.codigo}`,
            status: statusNaEmpresa,
          },
        })
      return p
    }
    async function posicao(
      p,
      local = 0,
      setor = 0,
      fisica = "0.000",
      reservada = "0.000",
      empresa = 0,
    ) {
      return prisma.estoque.create({
        data: {
          id_empresa: empresas[empresa],
          id_produto: p.id,
          id_local_estoque: locais[local].id,
          id_setor: setores[setor].id,
          quantidade: fisica,
          quantidade_reservada: reservada,
          data_atualizacao: new Date("2026-09-27T12:00:00Z"),
        },
      })
    }
    const tecido = await produto(`Tecido principal ${marker}`, {
      unidade: "M",
      permite_compra: true,
    })
    const base = await posicao(tecido, 0, 0, "150.125", "20.001")
    const norte = await posicao(tecido, 1, 1, "8.000", "10.000")
    const zerado = await produto("Produto zerado")
    const zero = await posicao(zerado)
    const negativo = await produto("Saldo negativo legado", {
      status: "INATIVO",
    })
    const neg = await posicao(negativo, 0, 0, "-1.001", "1.000")
    const inativo = await produto("Cadastro inativo com saldo", {
      status: "INATIVO",
      statusNaEmpresa: "INATIVO",
    })
    const velho = await posicao(inativo, 2, 2, "10.125", "0.001")
    const estrangeiro = await produto("SEGREDO PRODUTO B", { empresa: 1 })
    const outro = await posicao(estrangeiro, 3, 3, "999.000", "0.000", 1)
    const cruzado = await produto("Relação legado cruzada", {
      status: "INATIVO",
    })
    const cruzadoLocal = await posicao(cruzado, 3, 4, "777.000")
    const cruzadoSetorProduto = await produto("Setor legado cruzado", {
      status: "INATIVO",
    })
    const cruzadoSetor = await posicao(cruzadoSetorProduto, 0, 3, "777.000")
    for (let i = 0; i < 130; i++)
      await posicao(await produto(`Volume ${marker} ${i}`), 0, 0, "1.000")
    const novo = await produto("Novo vínculo com mínimo prévio")
    const semMinimo = await produto("Novo sem mínimo")
    const naoHabilitado = await produto("Global sem vínculo", {
      habilitado: false,
    })
    const produtoInativo = await produto("Inativo sem posição", {
      status: "INATIVO",
    })
    const vinculoInativo = await produto("Habilitação inativa", {
      statusNaEmpresa: "INATIVO",
    })
    const semControle = await produto("Não controla estoque", {
      controla_estoque: false,
    })
    const concorrente = await produto("Vínculo concorrente")
    const conflitoConcorrente = await produto("Setor concorrente")
    const rollback = await produto("Rollback da auditoria")
    for (const [p, local, quantidade_minima] of [
      [tecido, 0, "150.125"],
      [tecido, 1, "7.000"],
      [novo, 0, "5.000"],
    ])
      await prisma.estoque_minimo_local.create({
        data: {
          id_empresa: empresas[0],
          id_produto: p.id,
          id_local_estoque: locais[local].id,
          quantidade_minima,
        },
      })
    const minimoOriginal = await prisma.estoque_minimo_local.findFirstOrThrow({
      where: { id_empresa: empresas[0], id_produto: novo.id },
    })
    const cliente = await prisma.clientes.create({
      data: { id_empresa: empresas[0], nome_razao_social: `Cliente ${marker}` },
    })
    const venda = await prisma.venda.create({
      data: {
        id_empresa: empresas[0],
        id_cliente: cliente.id,
        id_usuario: usuarios[0],
        numero: `TEST-${marker}`,
        valor_total: "123.45",
      },
    })
    await prisma.reserva_estoque.create({
      data: {
        id_empresa: empresas[0],
        id_local_estoque: locais[0].id,
        id_setor: setores[0].id,
        id_produto: tecido.id,
        tipo_origem: "VENDA",
        id_venda: venda.id,
        id_usuario: usuarios[0],
        quantidade: "20.001",
      },
    })
    const movimento = await prisma.movimentacao_estoque.create({
      data: {
        id_empresa: empresas[0],
        id_local_estoque: locais[0].id,
        id_setor: setores[0].id,
        id_produto: tecido.id,
        id_usuario: usuarios[0],
        tipo: "AJUSTE_ENTRADA",
        quantidade: "150.125",
        valor_total: "123.45",
      },
    })
    await prisma.kardex.create({
      data: {
        id_empresa: empresas[0],
        id_local_estoque: locais[0].id,
        id_setor: setores[0].id,
        id_produto: tecido.id,
        id_movimentacao: movimento.id,
        tipo_movimentacao: "ENTRADA",
        quantidade: "150.125",
        saldo_anterior: "0.000",
        saldo_atual: "150.125",
      },
    })
    async function snapshot(models) {
      const state = {}
      for (const model of models)
        state[model] = await prisma[model].findMany({
          where: { id_empresa: { in: empresas } },
          orderBy: { id: "asc" },
        })
      return JSON.stringify(state)
    }
    const modelosLeitura = [
      "estoque",
      "produto_empresa",
      "estoque_minimo_local",
      "reserva_estoque",
      "movimentacao_estoque",
      "kardex",
      "venda",
      "compras",
      "nota_fiscal",
      "auditoria",
    ]
    const modelosHistorico = [
      "reserva_estoque",
      "movimentacao_estoque",
      "kardex",
      "venda",
      "compras",
      "nota_fiscal",
    ]
    const antesDasLeituras = await snapshot(modelosLeitura)
    const historicoOriginal = await snapshot(modelosHistorico)
    const http = await iniciarHttp()
    server = http.server
    const tokens = []
    for (const usuario of leitores) {
      const response = await fetch(http.base + "/api/auth/login", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: usuario.email, password }),
      })
      assert.equal(response.status, 200, "Login real deve funcionar.")
      const result = await response.json()
      assert.ok(result.accessToken)
      tokens.push(result.accessToken)
    }
    async function enviar(route = "/api/estoque", options = {}) {
      const {
        method = "GET",
        user = 0,
        empresa = empresas[0],
        body,
        raw,
        token = tokens[user],
      } = options
      const response = await fetch(http.base + route, {
        method,
        signal: AbortSignal.timeout(10000),
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(empresa !== null ? { "X-Empresa-Id": String(empresa) } : {}),
          ...(body !== undefined || raw !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(body !== undefined || raw !== undefined
          ? { body: raw ?? JSON.stringify(body) }
          : {}),
      })
      if (
        route === "/api/estoque" ||
        route.startsWith("/api/estoque?") ||
        route.startsWith("/api/estoque/")
      )
        assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      return { status: response.status, body: await response.json() }
    }
    const consultar = async (query = "", options = {}) => {
      const response = await enviar(
        "/api/estoque" + (query ? "?" + query : ""),
        options,
      )
      assert.equal(response.status, 200)
      return response.body
    }
    const associacao = (p = novo, local = 0, setor = 0) => ({
      idProduto: p.id,
      idLocalEstoque: locais[local].id,
      idSetor: setores[setor].id,
    })
    const postar = (body = associacao(), options = {}) =>
      enviar("/api/estoque", { method: "POST", body, ...options })
    const detalhe = (id, options = {}) => enviar(`/api/estoque/${id}`, options)
    let criado

    await t.test(
      "01 lista somente posições e relações da empresa autorizada",
      async () => {
        const result = await consultar()
        assert.equal(result.paginacao.totalRegistros, 135)
        assert.equal(result.dados.length, 25)
        assert.ok(
          result.dados.every(
            (r) =>
              r.localEstoque.id !== locais[3].id &&
              r.setor.id !== setores[3].id,
          ),
        )
        assert.doesNotMatch(JSON.stringify(result), /SEGREDO/)
      },
    )
    await t.test(
      "02 detalhe identifica produto, local, setor e status",
      async () => {
        const result = await detalhe(base.id)
        assert.equal(result.status, 200)
        assert.equal(result.body.idEstoque, base.id)
        assert.equal(result.body.produto.id, tecido.id)
        assert.equal(result.body.localEstoque.id, locais[0].id)
        assert.equal(result.body.setor.id, setores[0].id)
        assert.doesNotMatch(
          JSON.stringify(result.body),
          /preco|custo|fornecedor/,
        )
      },
    )
    await t.test(
      "03 filtro de produto retorna seus dois locais sem duplicação",
      async () => {
        const result = await consultar(`id_produto=${tecido.id}`)
        assert.equal(result.paginacao.totalRegistros, 2)
        assert.deepEqual(
          result.dados.map((r) => r.localEstoque.id),
          [locais[0].id, locais[1].id],
        )
      },
    )
    await t.test(
      "04 filtro de local retorna os produtos associados",
      async () => {
        const result = await consultar(`id_local_estoque=${locais[1].id}`)
        assert.equal(result.paginacao.totalRegistros, 1)
        assert.equal(result.dados[0].produto.id, tecido.id)
      },
    )
    await t.test("05 filtro de setor não confunde setor e local", async () => {
      const result = await consultar(`id_setor=${setores[1].id}`)
      assert.equal(result.paginacao.totalRegistros, 1)
      assert.equal(result.dados[0].setor.id, setores[1].id)
    })
    await t.test(
      "06 busca nome, código e código interno da empresa",
      async () => {
        for (const busca of [
          tecido.nome,
          tecido.codigo,
          `INTERNO-${tecido.codigo}`,
        ]) {
          const result = await consultar(
            new URLSearchParams({ busca }).toString(),
          )
          assert.equal(result.paginacao.totalRegistros, 2)
        }
        assert.equal(
          (await consultar("busca=%20%20")).paginacao.totalRegistros,
          135,
        )
      },
    )
    await t.test(
      "07 filtros combinam por AND e total respeita o mesmo escopo",
      async () => {
        const result = await consultar(
          `id_produto=${tecido.id}&id_local_estoque=${locais[0].id}&id_setor=${setores[0].id}&busca=${marker}`,
        )
        assert.equal(result.paginacao.totalRegistros, 1)
        assert.equal(result.dados[0].idEstoque, base.id)
        assert.equal(
          (
            await consultar(
              `id_produto=${tecido.id}&id_local_estoque=${locais[1].id}&id_setor=${setores[0].id}`,
            )
          ).paginacao.totalRegistros,
          0,
        )
      },
    )
    await t.test(
      "08 paginação estável, contagem completa e volume sem N+1",
      async () => {
        const ids = []
        for (let pagina = 1; pagina <= 8; pagina++) {
          const query = `pagina=${pagina}&limite=17`
          const result = await consultar(query)
          assert.equal(result.paginacao.totalRegistros, 135)
          assert.deepEqual(result, await consultar(query))
          ids.push(...result.dados.map((r) => r.idEstoque))
        }
        assert.equal(ids.length, 135)
        assert.equal(new Set(ids).size, 135)
        assert.deepEqual(
          ids,
          [...ids].sort((a, b) => a - b),
        )
        const fora = await consultar("pagina=999&limite=17")
        assert.deepEqual(fora.dados, [])
        assert.equal(fora.paginacao.totalRegistros, 135)
        const transactionOriginal = prisma.$transaction
        const queries = []
        prisma.$transaction = (run, options) =>
          transactionOriginal.call(
            prisma,
            async (tx) =>
              run(
                new Proxy(tx, {
                  get(target, key, receiver) {
                    if (key !== "$queryRaw")
                      return Reflect.get(target, key, receiver)
                    return (...args) => {
                      queries.push(args[0])
                      return target.$queryRaw(...args)
                    }
                  },
                }),
              ),
            options,
          )
        try {
          const result = await listarEstoque(
            empresas[0],
            filtrosEstoqueSchema.parse({ limite: "1" }),
          )
          assert.equal(result.dados.length, 1)
          assert.equal(result.paginacao.totalRegistros, 135)
          assert.equal(queries.length, 2)
          assert.match(queries[1].sql, /LIMIT \? OFFSET \?/)
          assert.deepEqual(queries[1].values.slice(-2), [1, 0])
        } finally {
          prisma.$transaction = transactionOriginal
        }
      },
    )
    await t.test(
      "09 resultados vazios e produto sem posição não geram saldo fictício",
      async () => {
        for (const query of [
          `id_produto=${novo.id}`,
          "busca=inexistente-impossivel",
          `id_local_estoque=${locais[3].id}`,
        ]) {
          const result = await consultar(query)
          assert.deepEqual(result.dados, [])
          assert.equal(result.paginacao.totalRegistros, 0)
          assert.equal(result.paginacao.totalPaginas, 0)
        }
      },
    )
    await t.test(
      "10 detalhe inexistente, alheio e legado cruzado são indistinguíveis",
      async () => {
        const vazio = await detalhe(2147483647)
        assert.equal(vazio.status, 404)
        for (const id of [outro.id, cruzadoLocal.id, cruzadoSetor.id])
          assert.deepEqual(await detalhe(id), vazio)
      },
    )
    await t.test(
      "11 precisão fracionária permanece exata com três casas",
      async () => {
        assert.equal((await detalhe(base.id)).body.quantidadeFisica, "150.125")
        assert.equal((await detalhe(velho.id)).body.quantidadeFisica, "10.125")
      },
    )
    await t.test(
      "12 físico, reservado e disponível são campos independentes",
      async () => {
        const result = (await detalhe(base.id)).body
        assert.equal(result.quantidadeFisica, "150.125")
        assert.equal(result.quantidadeReservada, "20.001")
        assert.equal(result.quantidadeDisponivel, "130.124")
        assert.equal(
          (await detalhe(norte.id)).body.quantidadeDisponivel,
          "-2.000",
        )
      },
    )
    await t.test(
      "13 zero é incluído por padrão e excluído explicitamente",
      async () => {
        assert.equal(
          (await consultar(`id_produto=${zerado.id}`)).dados[0].idEstoque,
          zero.id,
        )
        assert.deepEqual(
          (await consultar(`id_produto=${zerado.id}&incluir_zerados=false`))
            .dados,
          [],
        )
      },
    )
    await t.test(
      "14 saldo negativo e cadastros inativos continuam visíveis",
      async () => {
        const result = await consultar(
          `id_produto=${negativo.id}&incluir_zerados=false`,
        )
        assert.equal(result.dados[0].idEstoque, neg.id)
        assert.equal(result.dados[0].quantidadeFisica, "-1.001")
        assert.equal(result.dados[0].quantidadeDisponivel, "-2.001")
        const legado = (await detalhe(velho.id)).body
        assert.equal(legado.produto.status, "INATIVO")
        assert.equal(legado.produto.statusNaEmpresa, "INATIVO")
        assert.equal(legado.localEstoque.status, "INATIVO")
        assert.equal(legado.setor.status, "INATIVO")
      },
    )
    await t.test(
      "15 todas as leituras preservam saldos, datas, reservas e histórico preenchidos",
      async () => {
        assert.equal(await snapshot(modelosLeitura), antesDasLeituras)
      },
    )
    await t.test(
      "16 novo vínculo persistido começa com zero e retorna 201",
      async () => {
        const result = await postar()
        assert.equal(result.status, 201)
        assert.equal(result.body.criado, true)
        criado = result.body
        const row = await prisma.estoque.findUniqueOrThrow({
          where: { id: criado.idEstoque },
        })
        assert.equal(row.quantidade.toFixed(3), "0.000")
        assert.equal(row.quantidade_reservada.toFixed(3), "0.000")
        assert.equal(row.id_empresa, empresas[0])
      },
    )
    await t.test(
      "17 auditoria registra empresa, usuário e posição criada",
      async () => {
        const rows = await prisma.auditoria.findMany({
          where: {
            id_empresa: empresas[0],
            tabela: "estoque",
            id_registro: criado.idEstoque,
          },
        })
        assert.equal(rows.length, 1)
        assert.equal(rows[0].acao, "INSERT")
        assert.equal(rows[0].id_usuario, usuarios[0])
        assert.equal(JSON.parse(rows[0].dados_novos).idSetor, setores[0].id)
      },
    )
    await t.test(
      "18 produto global sem habilitação e de outra empresa retornam 404",
      async () => {
        const vazio = await postar({ ...associacao(), idProduto: 2147483647 })
        assert.equal(vazio.status, 404)
        assert.deepEqual(await postar(associacao(naoHabilitado)), vazio)
        assert.deepEqual(await postar(associacao(estrangeiro)), vazio)
      },
    )
    await t.test(
      "19 produto ou habilitação inativa não cria posição",
      async () => {
        for (const p of [produtoInativo, vinculoInativo])
          assert.equal((await postar(associacao(p))).status, 409)
      },
    )
    await t.test(
      "20 produto sem controle de estoque não cria posição",
      async () => {
        assert.equal((await postar(associacao(semControle))).status, 409)
      },
    )
    await t.test(
      "21 local de outra empresa não revela nome ou existência",
      async () => {
        const alheio = await postar(associacao(semMinimo, 3, 0))
        const ausente = await postar({
          ...associacao(semMinimo),
          idLocalEstoque: 2147483647,
        })
        assert.equal(alheio.status, 404)
        assert.deepEqual(alheio, ausente)
      },
    )
    await t.test(
      "22 setor de outra empresa não revela nome ou existência",
      async () => {
        const alheio = await postar(associacao(semMinimo, 0, 3))
        const ausente = await postar({
          ...associacao(semMinimo),
          idSetor: 2147483647,
        })
        assert.equal(alheio.status, 404)
        assert.deepEqual(alheio, ausente)
      },
    )
    await t.test(
      "23 local ou setor inativo impedem apenas novos vínculos",
      async () => {
        assert.equal((await postar(associacao(semMinimo, 2, 0))).status, 409)
        assert.equal((await postar(associacao(semMinimo, 0, 2))).status, 409)
      },
    )
    await t.test(
      "24 campo obrigatório ausente e IDs não estritos retornam 400",
      async () => {
        for (const campo of ["idProduto", "idLocalEstoque", "idSetor"]) {
          const body = associacao()
          delete body[campo]
          assert.equal((await postar(body)).status, 400)
          assert.equal(
            (await postar({ ...associacao(), [campo]: "1" })).status,
            400,
          )
        }
      },
    )
    await t.test(
      "25 rejeita saldo, reserva, empresa e usuário no JSON",
      async () => {
        for (const campo of [
          "id_empresa",
          "idEmpresa",
          "quantidade",
          "quantidadeFisica",
          "quantidade_reservada",
          "quantidadeReservada",
          "estoqueMinimo",
          "idUsuario",
        ])
          assert.equal(
            (await postar({ ...associacao(), [campo]: 1 })).status,
            400,
          )
        assert.equal((await postar(undefined, { raw: "{" })).status, 400)
      },
    )
    await t.test("26 repetição não duplica posição nem auditoria", async () => {
      assert.deepEqual(await postar(), {
        status: 200,
        body: { ...criado, criado: false },
      })
      assert.equal(
        await prisma.estoque.count({
          where: { id_empresa: empresas[0], id_produto: novo.id },
        }),
        1,
      )
      assert.equal(
        await prisma.auditoria.count({
          where: {
            id_empresa: empresas[0],
            tabela: "estoque",
            id_registro: criado.idEstoque,
          },
        }),
        1,
      )
      assert.equal((await postar(associacao(inativo, 2, 2))).status, 200)
    })
    await t.test(
      "27 repetir sobre saldo e reserva preserva valores e data",
      async () => {
        const antes = await prisma.estoque.findUniqueOrThrow({
          where: { id: base.id },
        })
        const result = await postar(associacao(tecido), { user: 2 })
        assert.equal(result.status, 200)
        assert.equal(result.body.criado, false)
        assert.deepEqual(
          await prisma.estoque.findUniqueOrThrow({ where: { id: base.id } }),
          antes,
        )
        assert.equal(
          await prisma.auditoria.count({
            where: {
              id_empresa: empresas[0],
              tabela: "estoque",
              id_registro: base.id,
            },
          }),
          0,
        )
      },
    )
    await t.test(
      "28 mesmo local/produto com outro setor retorna conflito",
      async () => {
        const result = await postar(associacao(tecido, 0, 4))
        assert.equal(result.status, 409)
        assert.doesNotMatch(JSON.stringify(result.body), /SEGREDO/)
      },
    )
    await t.test(
      "29 mesma empresa/setor/produto em outro local respeita segunda unicidade",
      async () => {
        assert.equal((await postar(associacao(tecido, 2, 0))).status, 409)
        const results = await Promise.all([
          postar(associacao(conflitoConcorrente, 0, 0)),
          postar(associacao(conflitoConcorrente, 1, 0)),
        ])
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
        assert.equal(
          await prisma.estoque.count({
            where: {
              id_empresa: empresas[0],
              id_produto: conflitoConcorrente.id,
            },
          }),
          1,
        )
      },
    )
    await t.test(
      "30 duas requisições concorrentes criam somente um vínculo e uma auditoria",
      async () => {
        const results = await Promise.all([
          postar(associacao(concorrente)),
          postar(associacao(concorrente)),
        ])
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 201])
        assert.equal(results[0].body.idEstoque, results[1].body.idEstoque)
        assert.equal(
          await prisma.estoque.count({
            where: { id_empresa: empresas[0], id_produto: concorrente.id },
          }),
          1,
        )
        assert.equal(
          await prisma.auditoria.count({
            where: {
              id_empresa: empresas[0],
              tabela: "estoque",
              id_registro: results[0].body.idEstoque,
            },
          }),
          1,
        )
      },
    )
    await t.test(
      "31 falha real da FK da auditoria reverte também a posição",
      async () => {
        const auditorias = await prisma.auditoria.count({
          where: { id_empresa: empresas[0] },
        })
        await assert.rejects(
          criarVinculoEstoque(
            { idEmpresa: empresas[0], idUsuario: 2147483647 },
            associacao(rollback),
          ),
          (error) => error.status === 409,
        )
        assert.equal(
          await prisma.estoque.count({
            where: { id_empresa: empresas[0], id_produto: rollback.id },
          }),
          0,
        )
        assert.equal(
          await prisma.auditoria.count({ where: { id_empresa: empresas[0] } }),
          auditorias,
        )
      },
    )
    await t.test(
      "32 vínculos não geram movimento, kardex, reserva ou alteração financeira",
      async () => {
        assert.equal(await snapshot(modelosHistorico), historicoOriginal)
      },
    )
    await t.test("33 GET, detalhe e POST exigem autenticação", async () => {
      assert.equal((await enviar("/api/estoque", { token: null })).status, 401)
      assert.equal((await detalhe(base.id, { token: null })).status, 401)
      assert.equal((await postar(associacao(), { token: null })).status, 401)
    })
    await t.test(
      "34 token inválido é recusado em consultas e criação",
      async () => {
        assert.equal(
          (await enviar("/api/estoque", { token: "invalido" })).status,
          401,
        )
        assert.equal(
          (await postar(associacao(), { token: "invalido" })).status,
          401,
        )
      },
    )
    await t.test(
      "35 usuário, empresa e vínculo inativos são revalidados no banco",
      async () => {
        for (const [model, id, ativo, inativo] of [
          ["usuarios", usuarios[0], "ATIVO", "INATIVO"],
          ["empresas", empresas[0], "ATIVA", "INATIVA"],
          ["usuario_empresa", vinculos[0].id, "ATIVO", "INATIVO"],
        ]) {
          await prisma[model].update({
            where: { id },
            data: { status: inativo },
          })
          try {
            assert.equal((await enviar()).status, 403)
            assert.equal((await postar()).status, 403)
          } finally {
            await prisma[model].update({
              where: { id },
              data: { status: ativo },
            })
          }
        }
      },
    )
    await t.test("36 leitura não concede permissão de criação", async () => {
      assert.equal((await enviar("/api/estoque", { user: 1 })).status, 200)
      assert.equal((await postar(associacao(), { user: 1 })).status, 403)
    })
    await t.test(
      "37 criação não concede leitura nem expõe saldo na repetição",
      async () => {
        assert.equal((await enviar("/api/estoque", { user: 2 })).status, 403)
        assert.equal((await detalhe(base.id, { user: 2 })).status, 403)
        const result = await postar(associacao(tecido), { user: 2 })
        assert.equal(result.status, 200)
        assert.deepEqual(
          Object.keys(result.body).sort(),
          [
            "criado",
            "idEstoque",
            "idLocalEstoque",
            "idProduto",
            "idSetor",
          ].sort(),
        )
      },
    )
    await t.test("38 edição não concede criação", async () => {
      assert.equal((await postar(associacao(), { user: 3 })).status, 403)
      assert.equal((await enviar("/api/estoque", { user: 3 })).status, 403)
    })
    await t.test(
      "39 exceções administrativas continuam exigindo vínculo ativo",
      async () => {
        await prisma.usuario_empresa.update({
          where: { id: vinculos[4].id },
          data: { nivel_acesso: "EMPRESA" },
        })
        try {
          assert.equal((await enviar("/api/estoque", { user: 4 })).status, 200)
          assert.equal(
            (await postar(associacao(tecido), { user: 4 })).status,
            200,
          )
          await prisma.usuario_empresa.update({
            where: { id: vinculos[4].id },
            data: { status: "INATIVO" },
          })
          assert.equal(
            (await postar(associacao(tecido), { user: 4 })).status,
            403,
          )
        } finally {
          await prisma.usuario_empresa.update({
            where: { id: vinculos[4].id },
            data: { nivel_acesso: "USUARIO", status: "ATIVO" },
          })
        }
        assert.equal(
          (await enviar("/api/estoque", { user: 5, empresa: empresas[0] }))
            .status,
          403,
        )
      },
    )
    await t.test(
      "40 header não autoriza outra empresa; seleção múltipla é obrigatória",
      async () => {
        assert.equal(
          (await enviar("/api/estoque", { empresa: empresas[1] })).status,
          403,
        )
        assert.equal(
          (await postar(associacao(), { empresa: empresas[1] })).status,
          403,
        )
        const extra = await prisma.usuario_empresa.create({
          data: {
            id_usuario: usuarios[1],
            id_empresa: empresas[1],
            id_cargo: cargos[1].id,
          },
        })
        try {
          assert.equal(
            (await enviar("/api/estoque", { user: 1, empresa: null })).status,
            400,
          )
        } finally {
          await prisma.usuario_empresa.delete({ where: { id: extra.id } })
        }
      },
    )
    await t.test(
      "41 não vaza nomes, saldos ou contagens em filtros e erros",
      async () => {
        for (const query of [
          `id_produto=${estrangeiro.id}`,
          `id_local_estoque=${locais[3].id}`,
          `id_setor=${setores[3].id}`,
          "busca=SEGREDO",
        ]) {
          const result = await consultar(query)
          assert.deepEqual(result.dados, [])
          assert.equal(result.paginacao.totalRegistros, 0)
        }
        assert.doesNotMatch(
          JSON.stringify((await postar(associacao(estrangeiro))).body),
          /SEGREDO|SQL|stack|token/,
        )
        const propriaB = await consultar("", { user: 5, empresa: empresas[1] })
        assert.equal(propriaB.paginacao.totalRegistros, 1)
        assert.equal(propriaB.dados[0].idEstoque, outro.id)
      },
    )
    await t.test(
      "42 parâmetros inválidos, repetidos e maliciosos não alteram consultas",
      async () => {
        for (const query of [
          "pagina=0",
          "limite=101",
          "id_setor=2147483648",
          "id_produto=1.5",
          "incluir_zerados=FALSE",
          "pagina=1&pagina=2",
          "id_empresa=1",
          "ordenar_por=SQL",
          "busca=" + "a".repeat(101),
        ])
          assert.equal((await enviar("/api/estoque?" + query)).status, 400)
        assert.equal((await detalhe("1%20OR%201=1")).status, 400)
        assert.equal(
          (await postar({ ...associacao(), idProduto: "1 OR 1=1" })).status,
          400,
        )
        assert.deepEqual(
          (
            await consultar(
              new URLSearchParams({ busca: "' OR 1=1 -- %_" }).toString(),
            )
          ).dados,
          [],
        )
      },
    )
    await t.test(
      "43 relatório existente preserva saldos e isolamento",
      async () => {
        const result = await enviar(
          `/api/relatorios/estoque/produtos?id_produto=${tecido.id}`,
        )
        assert.equal(result.status, 200)
        assert.equal(result.body.paginacao.totalRegistros, 2)
        assert.equal(result.body.dados[0].quantidadeFisica, "150.125")
        assert.equal(result.body.dados[0].quantidadeDisponivel, "130.124")
        assert.doesNotMatch(JSON.stringify(result.body), /SEGREDO/)
      },
    )
    await t.test(
      "44 posição criada aparece no relatório apenas pelos filtros apropriados",
      async () => {
        const result = await enviar(
          `/api/relatorios/estoque/produtos?id_produto=${novo.id}`,
        )
        assert.equal(result.status, 200)
        assert.equal(result.body.paginacao.totalRegistros, 1)
        assert.equal(result.body.dados[0].quantidadeFisica, "0.000")
        const semZero = await enviar(
          `/api/relatorios/estoque/produtos?id_produto=${novo.id}&incluir_zerados=false`,
        )
        assert.deepEqual(semZero.body.dados, [])
      },
    )
    await t.test(
      "45 alerta usa físico <= mínimo sem descontar reservas",
      async () => {
        const result = await enviar("/api/estoque-minimo")
        assert.equal(result.status, 200)
        assert.equal(
          result.body.posicoes.find((r) => r.idEstoque === base.id).estado,
          "NO_MINIMO",
        )
        assert.equal(
          result.body.posicoes.find((r) => r.idEstoque === norte.id).estado,
          "REGULAR",
        )
        assert.equal(
          result.body.posicoes.find((r) => r.idEstoque === criado.idEstoque)
            .estado,
          "SEM_ESTOQUE",
        )
      },
    )
    await t.test(
      "46 configuração prévia de mínimo não é sobrescrita pelo vínculo",
      async () => {
        assert.deepEqual(
          await prisma.estoque_minimo_local.findUniqueOrThrow({
            where: { id: minimoOriginal.id },
          }),
          minimoOriginal,
        )
      },
    )
    await t.test(
      "47 novo vínculo sem mínimo mantém ausência explícita de configuração",
      async () => {
        const result = await postar(associacao(semMinimo))
        assert.equal(result.status, 201)
        assert.equal(
          await prisma.estoque_minimo_local.count({
            where: { id_empresa: empresas[0], id_produto: semMinimo.id },
          }),
          0,
        )
        const minimo = await enviar("/api/estoque-minimo")
        const row = minimo.body.posicoes.find(
          (r) => r.idEstoque === result.body.idEstoque,
        )
        assert.equal(row.minimo, null)
        assert.equal(row.estado, "NAO_CONFIGURADO")
      },
    )
    await t.test(
      "48 leitura/edição de mínimo e relatório mantêm permissões independentes",
      async () => {
        assert.equal(
          (await enviar("/api/estoque-minimo", { user: 1 })).status,
          200,
        )
        assert.equal(
          (await enviar("/api/relatorios/estoque/produtos", { user: 1 }))
            .status,
          200,
        )
        const body = {
          idProduto: tecido.id,
          idLocalEstoque: locais[0].id,
          quantidadeMinima: "150.125",
        }
        assert.equal(
          (
            await enviar("/api/estoque-minimo", {
              method: "PUT",
              user: 1,
              body,
            })
          ).status,
          403,
        )
        assert.equal(
          (
            await enviar("/api/estoque-minimo", {
              method: "PUT",
              user: 2,
              body,
            })
          ).status,
          403,
        )
        const result = await enviar("/api/estoque-minimo", {
          method: "PUT",
          user: 3,
          body,
        })
        assert.equal(result.status, 200)
        assert.equal(result.body.configuracao.quantidadeMinima, "150.125")
      },
    )
  } finally {
    if (server && server.exitCode === null)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 5000)
        server.once("exit", () => {
          clearTimeout(timer)
          resolve()
        })
        server.kill()
      })
    if (prisma) {
      try {
        if (empresas.length) {
          for (const model of [
            "reserva_estoque",
            "kardex",
            "movimentacao_estoque",
            "venda",
            "clientes",
            "estoque_minimo_local",
            "estoque",
            "auditoria",
            "usuario_empresa",
            "cargos",
            "setores",
            "locais_estoque",
            "produto_empresa",
          ])
            await prisma[model].deleteMany({
              where: { id_empresa: { in: empresas } },
            })
          await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
          await prisma.tipos_produto.deleteMany({
            where: { id: { in: tipos } },
          })
          await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
          await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
        }
      } finally {
        await prisma.$disconnect()
      }
    }
    hooks.deregister()
  }
})
