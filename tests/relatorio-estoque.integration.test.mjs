import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createServer } from "node:net"
import path from "node:path"
import ts from "typescript"

// O runner não carrega .env nem aceita URL implícita do ambiente da aplicação.
const databaseUrl = process.env.ESTOQUE_RELATORIO_TEST_DATABASE_URL

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
  const base = `http://127.0.0.1:${port}`
  try {
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      assert.equal(
        server.exitCode,
        null,
        "O build Next encerrou antes do teste HTTP",
      )
      try {
        const result = await fetch(`${base}/api/relatorios/estoque/produtos`, {
          signal: AbortSignal.timeout(2000),
        })
        if (result.status === 401) return { server, base }
      } catch {
        /* Processo ainda iniciando; prazo limitado acima. */
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error(
      "O servidor não iniciou. Execute npm run build antes do teste.",
    )
  } catch (error) {
    server.kill()
    throw error
  }
}

test("Relatório: MariaDB/MySQL isolado e HTTP de produção", async (t) => {
  assert.ok(
    databaseUrl,
    "Defina ESTOQUE_RELATORIO_TEST_DATABASE_URL; ausência de banco não é aprovação.",
  )
  const url = new URL(databaseUrl)
  assert.equal(url.protocol, "mysql:")
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Somente host local",
  )
  assert.match(
    url.pathname,
    /^\/[a-zA-Z0-9_]+_test$/,
    "Banco dedicado com sufixo _test",
  )
  process.env.DATABASE_URL = databaseUrl
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  delete process.env.DEV_ID_USUARIO
  delete process.env.DEV_ID_EMPRESA
  const hooks = carregarTypescript()
  let prisma, server
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = []
  try {
    ;({ prisma } = await import("../src/lib/prisma.ts"))
    for (const model of ["empresas", "usuarios", "produtos", "tipos_produto"])
      assert.equal(
        await prisma[model].count(),
        0,
        `O banco deve estar vazio de dados de negócio: ${model}`,
      )
    const { Prisma } = await import("../src/generated/prisma/client.ts")
    const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
    const marker = randomUUID().slice(0, 8)
    const password = randomBytes(24).toString("hex")
    const senha = await hashPassword(password)
    const locais = [],
      setores = [],
      leitores = [],
      vinculos = []
    for (let i = 0; i < 2; i++) {
      const empresa = await prisma.empresas.create({
        data: {
          razao_social: `Relatorio ${marker} ${i}`,
          cnpj: `${Date.now()}${i}`,
        },
      })
      empresas.push(empresa.id)
      const cargo = await prisma.cargos.create({
        data: { id_empresa: empresa.id, nome: "PRODUCAO" },
      })
      const usuario = await prisma.usuarios.create({
        data: {
          nome: "Leitor relatório",
          email: `${marker}-${i}@example.test`,
          senha,
        },
      })
      usuarios.push(usuario.id)
      leitores.push(usuario)
      const vinculo = await prisma.usuario_empresa.create({
        data: {
          id_usuario: usuario.id,
          id_empresa: empresa.id,
          id_cargo: cargo.id,
        },
      })
      vinculos.push(vinculo.id)
      await prisma.permissoes_usuario.create({
        data: {
          id_usuario_empresa: vinculo.id,
          recurso: "ESTOQUE",
          pode_ler: true,
        },
      })
      for (let j = 0; j < (i === 0 ? 2 : 1); j++) {
        locais.push(
          await prisma.locais_estoque.create({
            data: {
              id_empresa: empresa.id,
              nome: `Local ${i}-${j}`,
              status: j === 1 ? "INATIVO" : "ATIVO",
            },
          }),
        )
        setores.push(
          await prisma.setores.create({
            data: { id_empresa: empresa.id, nome: `Setor ${j}` },
          }),
        )
      }
    }
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Relatorio ${marker}` },
    })
    tipos.push(tipo.id)
    const linhas = []
    async function produto(nome, unidade, empresa = 0, inativo = false) {
      const p = await prisma.produtos.create({
        data: {
          nome,
          unidade,
          codigo: `${marker}-${produtos.length}`,
          id_tipo_produto: tipo.id,
          status: inativo ? "INATIVO" : "ATIVO",
        },
      })
      produtos.push(p.id)
      await prisma.produto_empresa.create({
        data: {
          id_empresa: empresas[empresa],
          id_produto: p.id,
          codigo_interno: `INT-${p.codigo}`,
          status: inativo ? "INATIVO" : "ATIVO",
        },
      })
      return p
    }
    async function saldo(
      p,
      local,
      fisica,
      reservada = "0.000",
      visivel = true,
      empresa = local.id_empresa,
      setor = setores[locais.indexOf(local)],
    ) {
      const row = await prisma.estoque.create({
        data: {
          id_empresa: empresa,
          id_local_estoque: local.id,
          id_setor: setor.id,
          id_produto: p.id,
          quantidade: fisica,
          quantidade_reservada: reservada,
          data_atualizacao: new Date("2026-01-01T12:00:00Z"),
        },
      })
      if (visivel) linhas.push({ p, local, fisica, reservada, row })
    }
    const tecido = await produto("Tecido fracionário", "M")
    await saldo(tecido, locais[0], "150.125", "20.001")
    await saldo(tecido, locais[1], "8.000", "9.000")
    const micro1 = await produto("Micro A", "KG"),
      micro2 = await produto("Micro B", "KG")
    await saldo(micro1, locais[0], "0.001")
    await saldo(micro2, locais[0], "0.002")
    const zero = await produto("Saldo zero", "UN")
    await saldo(zero, locais[0], "0.000")
    const negativo = await produto("Saldo negativo", "UN", 0, true)
    await saldo(negativo, locais[0], "-2.500", "1.000")
    const minuscula = await produto("Unidade minúscula", "m")
    await saldo(minuscula, locais[0], "4.000")
    const semSaldo = await produto("Sem saldo registrado", "UN")
    const estrangeiro = await produto("SEGREDO EMPRESA B", "UN", 1)
    await saldo(estrangeiro, locais[2], "999.000")
    // FKs simples do legado permitem relações cruzadas; a consulta deve rejeitá-las.
    const cruzado = await produto("Vínculo inconsistente", "UN")
    await saldo(cruzado, locais[2], "777.000", "0.000", false, empresas[0])
    await saldo(estrangeiro, locais[0], "666.000", "0.000", false, empresas[0])
    const setorCruzado = await produto("Setor inconsistente", "UN")
    await saldo(
      setorCruzado,
      locais[0],
      "555.000",
      "0.000",
      false,
      empresas[0],
      setores[2],
    )
    for (let i = 0; i < 240; i++)
      await saldo(
        await produto("Volume com nome igual", "UN"),
        locais[0],
        "1.000",
      )

    const http = await iniciarHttp()
    server = http.server
    const tokens = []
    for (const leitor of leitores) {
      const response = await fetch(`${http.base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: leitor.email, password }),
      })
      assert.equal(
        response.status,
        200,
        "Login real com senha e perfil do banco",
      )
      tokens.push((await response.json()).accessToken)
    }
    async function consultar(
      query = "",
      usuario = 0,
      empresa = empresas[usuario],
      status = 200,
      token = tokens[usuario],
    ) {
      const response = await fetch(
        `${http.base}/api/relatorios/estoque/produtos?${query}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "X-Empresa-Id": String(empresa),
          },
        },
      )
      assert.equal(response.status, status)
      assert.equal(response.headers.get("Cache-Control"), "private, no-store")
      return response.json()
    }
    function validarResumo(result, esperadas) {
      assert.equal(result.paginacao.totalRegistros, esperadas.length)
      assert.equal(
        result.resumo.totalProdutosDistintos,
        new Set(esperadas.map((r) => r.p.id)).size,
      )
      assert.equal(
        result.resumo.totalLocais,
        new Set(esperadas.map((r) => r.local.id)).size,
      )
      const grupos = new Map()
      for (const r of esperadas) {
        const key = `${r.local.id}/${r.p.unidade}`
        const grupo = grupos.get(key) ?? {
          idLocalEstoque: r.local.id,
          unidade: r.p.unidade,
          fisica: new Prisma.Decimal(0),
          reservada: new Prisma.Decimal(0),
        }
        grupo.fisica = grupo.fisica.plus(r.fisica)
        grupo.reservada = grupo.reservada.plus(r.reservada)
        grupos.set(key, grupo)
      }
      const expected = [...grupos.values()].map((g) => ({
        idLocalEstoque: g.idLocalEstoque,
        unidade: g.unidade,
        quantidadeFisica: g.fisica.toFixed(3),
        quantidadeReservada: g.reservada.toFixed(3),
        quantidadeDisponivel: g.fisica.minus(g.reservada).toFixed(3),
      }))
      const sort = (items) =>
        items.sort((a, b) =>
          `${a.idLocalEstoque}/${a.unidade}`.localeCompare(
            `${b.idLocalEstoque}/${b.unidade}`,
          ),
        )
      assert.deepEqual(sort(result.resumo.porLocalEUnidade), sort(expected))
    }
    const daEmpresaA = linhas.filter((r) => r.local.id_empresa === empresas[0])
    await t.test(
      "produto em dois locais; frações, reserva e data de origem",
      async () => {
        const result = await consultar(`id_produto=${tecido.id}`)
        validarResumo(
          result,
          linhas.filter((r) => r.p.id === tecido.id),
        )
        assert.deepEqual(
          result.dados.map((r) => [
            r.localEstoque.id,
            r.quantidadeFisica,
            r.quantidadeReservada,
            r.quantidadeDisponivel,
          ]),
          [
            [locais[0].id, "150.125", "20.001", "130.124"],
            [locais[1].id, "8.000", "9.000", "-1.000"],
          ],
        )
        assert.equal(result.dados[0].atualizadoEm, "2026-01-01T12:00:00.000Z")
        assert.ok(Number.isFinite(Date.parse(result.geradoEm)))
        assert.equal(result.dados[1].localEstoque.status, "INATIVO")
      },
    )
    await t.test(
      "isolamento de linhas, nomes, contagens, totais e vínculos corrompidos",
      async () => {
        const a = await consultar(),
          b = await consultar("", 1)
        validarResumo(a, daEmpresaA)
        validarResumo(
          b,
          linhas.filter((r) => r.local.id_empresa === empresas[1]),
        )
        assert.ok(!JSON.stringify(a).includes("SEGREDO"))
        assert.equal(b.dados[0].produto.nome, estrangeiro.nome)
        for (const query of [
          `id_local_estoque=${locais[2].id}`,
          `id_produto=${estrangeiro.id}`,
          "id_produto=2147483647",
          "busca=SEGREDO",
          `id_produto=${cruzado.id}`,
          `id_produto=${setorCruzado.id}`,
        ]) {
          const result = await consultar(query)
          assert.deepEqual(result.dados, [])
          validarResumo(result, [])
        }
      },
    )
    await t.test("JWT obrigatório e empresa não autorizada", async () => {
      await consultar("", 0, empresas[0], 401, null)
      await consultar("", 0, empresas[0], 401, "invalido")
      await consultar("", 0, empresas[1], 403)
    })
    await t.test(
      "permissão real e estados ativos revalidados no banco",
      async () => {
        await prisma.permissoes_usuario.updateMany({
          where: { id_usuario_empresa: vinculos[0] },
          data: { pode_ler: false },
        })
        await consultar("", 0, empresas[0], 403)
        await prisma.permissoes_usuario.updateMany({
          where: { id_usuario_empresa: vinculos[0] },
          data: { pode_ler: true },
        })
        for (const [model, id, inativo, ativo] of [
          ["usuario_empresa", vinculos[0], "INATIVO", "ATIVO"],
          ["usuarios", usuarios[0], "INATIVO", "ATIVO"],
          ["empresas", empresas[0], "INATIVA", "ATIVA"],
        ]) {
          await prisma[model].update({
            where: { id },
            data: { status: inativo },
          })
          await consultar("", 0, empresas[0], 403)
          await prisma[model].update({ where: { id }, data: { status: ativo } })
        }
      },
    )
    await t.test(
      "zero, negativos, inativos e ausência de linha artificial",
      async () => {
        assert.equal(
          (await consultar(`id_produto=${zero.id}`)).dados[0].quantidadeFisica,
          "0.000",
        )
        const semZero = await consultar("incluir_zerados=false")
        validarResumo(
          semZero,
          daEmpresaA.filter((r) => r.fisica !== "0.000"),
        )
        const n = (
          await consultar(`id_produto=${negativo.id}&incluir_zerados=false`)
        ).dados[0]
        assert.equal(n.quantidadeFisica, "-2.500")
        assert.equal(n.quantidadeDisponivel, "-3.500")
        assert.equal(n.produto.status, "INATIVO")
        assert.equal(n.produto.statusNaEmpresa, "INATIVO")
        validarResumo(await consultar(`id_produto=${semSaldo.id}`), [])
      },
    )
    await t.test(
      "agregação decimal exata e unidades sem conversão",
      async () => {
        const result = await consultar(`id_local_estoque=${locais[0].id}`)
        validarResumo(
          result,
          daEmpresaA.filter((r) => r.local.id === locais[0].id),
        )
        assert.equal(
          result.resumo.porLocalEUnidade.find((g) => g.unidade === "KG")
            .quantidadeFisica,
          "0.003",
        )
        assert.deepEqual(
          new Set(result.resumo.porLocalEUnidade.map((g) => g.unidade)),
          new Set(["KG", "M", "m", "UN"]),
        )
      },
    )
    await t.test(
      "busca por nome, código, código interno, vazio e filtros AND",
      async () => {
        for (const busca of [
          "Tecido fracionário",
          tecido.codigo,
          `INT-${tecido.codigo}`,
        ]) {
          const result = await consultar(
            new URLSearchParams({
              busca: ` ${busca} `,
              id_produto: String(tecido.id),
              id_local_estoque: String(locais[0].id),
            }),
          )
          validarResumo(
            result,
            linhas.filter(
              (r) => r.p.id === tecido.id && r.local.id === locais[0].id,
            ),
          )
        }
        validarResumo(await consultar("busca=++"), daEmpresaA)
        validarResumo(await consultar("busca=inexistente"), [])
      },
    )
    await t.test(
      "volume, ordenação estável, páginas sem repetição e totais globais",
      async () => {
        for (const ordenar_por of ["local", "produto", "quantidade_fisica"]) {
          for (const direcao of ["asc", "desc"]) {
            const ids = []
            for (
              let pagina = 1;
              pagina <= Math.ceil(daEmpresaA.length / 100);
              pagina++
            ) {
              const result = await consultar(
                new URLSearchParams({
                  ordenar_por,
                  direcao,
                  pagina: String(pagina),
                  limite: "100",
                }),
              )
              validarResumo(result, daEmpresaA)
              assert.ok(result.dados.length <= 100)
              ids.push(
                ...result.dados.map(
                  (r) => `${r.localEstoque.id}/${r.produto.id}`,
                ),
              )
              assert.deepEqual(
                (
                  await consultar(
                    new URLSearchParams({
                      ordenar_por,
                      direcao,
                      pagina: String(pagina),
                      limite: "100",
                    }),
                  )
                ).dados,
                result.dados,
              )
            }
            assert.equal(new Set(ids).size, daEmpresaA.length)
            assert.equal(ids.length, daEmpresaA.length)
          }
        }
        const fora = await consultar("pagina=999")
        validarResumo(fora, daEmpresaA)
        assert.deepEqual(fora.dados, [])
      },
    )
    await t.test("validação HTTP e entradas maliciosas", async () => {
      for (const query of [
        "pagina=0",
        "limite=101",
        "incluir_zerados=no",
        "ordenar_por=DROP",
        "id_empresa=1",
        "id_produto=1%20OR%201=1",
        "pagina=1&pagina=2",
        "id_produto=1.5",
      ])
        await consultar(query, 0, empresas[0], 400)
      for (const busca of ["' OR 1=1 --", "%", "_", "\\"])
        validarResumo(await consultar(new URLSearchParams({ busca })), [])
    })
    await t.test(
      "leituras repetidas não alteram saldos nem outras tabelas de negócio",
      async () => {
        const tabelas = [
          "estoque",
          "produto_empresa",
          "reserva_estoque",
          "movimentacao_estoque",
          "kardex",
          "compras",
          "venda",
          "nota_fiscal",
        ]
        async function snapshot() {
          const state = {}
          for (const model of tabelas)
            state[model] = await prisma[model].findMany({
              where: { id_empresa: { in: empresas } },
              orderBy: { id: "asc" },
            })
          return JSON.stringify(state)
        }
        const antes = await snapshot()
        await consultar()
        await consultar("incluir_zerados=false&ordenar_por=quantidade_fisica")
        assert.equal(await snapshot(), antes)
      },
    )
  } finally {
    if (server && server.exitCode === null) {
      const encerrado = once(server, "exit")
      server.kill()
      await encerrado
    }
    if (prisma) {
      // Somente IDs criados por este teste, jamais truncate, reset ou limpeza global.
      try {
        if (empresas.length) {
          await prisma.estoque.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.usuario_empresa.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          for (const model of [
            "cargos",
            "setores",
            "locais_estoque",
            "produto_empresa",
          ])
            await prisma[model].deleteMany({
              where: { id_empresa: { in: empresas } },
            })
          await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
        }
        if (usuarios.length)
          await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
        if (produtos.length)
          await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
        if (tipos.length)
          await prisma.tipos_produto.deleteMany({
            where: { id: { in: tipos } },
          })
      } finally {
        await prisma.$disconnect()
      }
    }
    hooks.deregister()
  }
})
