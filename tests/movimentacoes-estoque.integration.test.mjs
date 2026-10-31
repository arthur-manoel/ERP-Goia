import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"
import nextEnv from "@next/env"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
const { loadEnvConfig } = nextEnv

// O ambiente configurado só é usado mediante opção explícita e host local.
if (process.argv.includes("--configured-db")) loadEnvConfig(process.cwd())
const databaseUrl =
  process.env.MOVIMENTACOES_ESTOQUE_TEST_DATABASE_URL ??
  (process.argv.includes("--configured-db")
    ? process.env.DATABASE_URL
    : undefined)

test("Estoque: banco real, autorização, saldo, rollback e concorrência", async (t) => {
  assert.ok(
    databaseUrl,
    "Defina MOVIMENTACOES_ESTOQUE_TEST_DATABASE_URL ou use --configured-db para o banco local.",
  )
  const url = new URL(databaseUrl)
  assert.equal(url.protocol, "mysql:")
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Testes permitidos somente em banco local.",
  )
  process.env.DATABASE_URL = databaseUrl
  process.env.ACCESS_TOKEN_SECRET = randomBytes(48).toString("hex")
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only")
        return { url: "data:text/javascript,export {};", shortCircuit: true }
      if (specifier === "next/server") return next("next/server.js", context)
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
  const marker = `mov-${randomUUID()}`
  const empresas = [],
    usuarios = [],
    produtos = [],
    tipos = []
  let prisma, server, httpBase
  try {
    ;({ prisma } = await import("../src/lib/prisma.ts"))
    const { signAccessToken } = await import("../src/lib/jwt.ts")
    const { entradaHandler, saidaHandler, ajusteHandler, saldoHandler } =
      await import("../src/modules/movimentacoes-estoque/router.ts")
    const locais = [],
      setores = []
    for (let i = 0; i < 2; i++) {
      const empresa = await prisma.empresas.create({
        data: { razao_social: `${marker}-${i}`, cnpj: `${Date.now()}${i}` },
      })
      empresas.push(empresa.id)
      locais.push(
        await prisma.locais_estoque.create({
          data: { id_empresa: empresa.id, nome: marker },
        }),
      )
      setores.push(
        await prisma.setores.create({
          data: { id_empresa: empresa.id, nome: marker },
        }),
      )
    }
    const tipo = await prisma.tipos_produto.create({ data: { nome: marker } })
    tipos.push(tipo.id)
    const produto = await prisma.produtos.create({
      data: {
        nome: marker,
        codigo: marker,
        unidade: "KG",
        id_tipo_produto: tipo.id,
        controla_estoque: true,
      },
    })
    produtos.push(produto.id)
    for (const id_empresa of empresas)
      await prisma.produto_empresa.create({
        data: { id_empresa, id_produto: produto.id },
      })
    const usuario = await prisma.usuarios.create({
      data: {
        nome: marker,
        email: `${marker}@example.test`,
        senha: "fixture-sem-login",
      },
    })
    usuarios.push(usuario.id)
    const cargo = await prisma.cargos.create({
      data: { id_empresa: empresas[0], nome: "PRODUCAO" },
    })
    const vinculo = await prisma.usuario_empresa.create({
      data: {
        id_usuario: usuario.id,
        id_empresa: empresas[0],
        id_cargo: cargo.id,
      },
    })
    const permissao = await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculo.id,
        recurso: "ESTOQUE",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
      },
    })
    const token = signAccessToken({
      id: usuario.id,
      name: marker,
      role: "PRODUCAO",
    })
    const base = {
      idProduto: produto.id,
      idLocalEstoque: locais[0].id,
      idSetor: setores[0].id,
      observacao: "Teste de estoque",
    }
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-Empresa-Id": String(empresas[0]),
      "Content-Type": "application/json",
    }
    if (process.argv.includes("--http")) {
      const socket = createServer()
      socket.listen(0, "127.0.0.1")
      await once(socket, "listening")
      const port = socket.address().port
      await new Promise((resolve) => socket.close(resolve))
      server = spawn(
        process.execPath,
        [
          path.resolve("node_modules/next/dist/bin/next"),
          "dev",
          "--webpack",
          "-H",
          "127.0.0.1",
          "-p",
          String(port),
        ],
        {
          env: {
            ...process.env,
            NODE_ENV: "development",
            NODE_OPTIONS: "--max-old-space-size=1024 --max-semi-space-size=4",
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        },
      )
      let logs = ""
      for (const stream of [server.stdout, server.stderr])
        stream.on("data", (chunk) => {
          logs = (logs + String(chunk)).slice(-3000)
        })
      httpBase = `http://127.0.0.1:${port}`
      const deadline = Date.now() + 60000
      let pronto = false
      while (Date.now() < deadline) {
        assert.equal(server.exitCode, null, `Next encerrou: ${logs}`)
        try {
          const response = await fetch(`${httpBase}/api/estoque/saldo`, {
            signal: AbortSignal.timeout(3000),
          })
          if (response.status === 401) {
            pronto = true
            break
          }
        } catch {
          /* Aguarda servidor e compilação da rota. */
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      assert.ok(pronto, `Servidor HTTP não iniciou: ${logs}`)
    }
    async function chamar(handler, body, alteracoes = {}) {
      if (httpBase) {
        const rota =
          handler === entradaHandler
            ? "entradas"
            : handler === saidaHandler
              ? "saidas"
              : "ajustes"
        return fetch(`${httpBase}/api/estoque/${rota}`, {
          method: "POST",
          headers: { ...headers, ...alteracoes },
          body: JSON.stringify(body),
        })
      }
      return handler(
        new Request("http://localhost/api/estoque", {
          method: "POST",
          headers: { ...headers, ...alteracoes },
          body: JSON.stringify(body),
        }),
      )
    }
    async function ok(handler, body) {
      const response = await chamar(handler, body)
      const data = await response.json()
      assert.equal(response.status, 201, JSON.stringify(data))
      assert.equal(response.headers.get("Cache-Control"), "no-store")
      return data
    }
    async function saldo() {
      const response = httpBase
        ? await fetch(
            `${httpBase}/api/estoque/saldo?idProduto=${produto.id}&idLocalEstoque=${locais[0].id}`,
            { headers },
          )
        : await saldoHandler(
            new Request(
              `http://localhost/api/estoque/saldo?idProduto=${produto.id}&idLocalEstoque=${locais[0].id}`,
              { headers },
            ),
          )
      assert.equal(response.status, 200, await response.clone().text())
      return response.json()
    }
    async function snapshot() {
      const rows = {}
      for (const model of [
        "estoque",
        "movimentacao_estoque",
        "kardex",
        "auditoria",
      ])
        rows[model] = await prisma[model].findMany({
          where: { id_empresa: empresas[0] },
          orderBy: { id: "asc" },
        })
      return JSON.stringify(rows)
    }
    await t.test(
      "nega JWT ausente/inválido, empresa alheia e IDs cruzados",
      async () => {
        assert.equal(
          (
            await chamar(
              entradaHandler,
              { ...base, quantidade: "1" },
              { Authorization: "" },
            )
          ).status,
          401,
        )
        assert.equal(
          (
            await chamar(
              entradaHandler,
              { ...base, quantidade: "1" },
              { Authorization: "Bearer adulterado" },
            )
          ).status,
          401,
        )
        assert.equal(
          (
            await chamar(
              entradaHandler,
              { ...base, quantidade: "1" },
              { "X-Empresa-Id": String(empresas[1]) },
            )
          ).status,
          403,
        )
        assert.equal(
          (
            await chamar(entradaHandler, {
              ...base,
              idLocalEstoque: locais[1].id,
              quantidade: "1",
            })
          ).status,
          404,
        )
        assert.equal(
          (
            await chamar(entradaHandler, {
              ...base,
              idSetor: setores[1].id,
              quantidade: "1",
            })
          ).status,
          404,
        )
        assert.equal(
          (
            await chamar(entradaHandler, {
              ...base,
              idEmpresa: empresas[1],
              quantidade: "1",
            })
          ).status,
          400,
        )
        assert.equal(
          await prisma.movimentacao_estoque.count({
            where: { id_empresa: { in: empresas } },
          }),
          0,
        )
      },
    )
    await t.test(
      "primeira entrada, decimal exato, saída, ajuste e kardex",
      async () => {
        assert.equal(
          (await ok(entradaHandler, { ...base, quantidade: "10.001" }))
            .saldoAtual,
          "10.001",
        )
        assert.equal(
          (await ok(saidaHandler, { ...base, quantidade: "0.001" })).saldoAtual,
          "10.000",
        )
        assert.equal(
          (
            await ok(ajusteHandler, {
              ...base,
              saldoNovo: "8.000",
              saldoEsperado: "10.000",
            })
          ).saldoAtual,
          "8.000",
        )
        const resultado = await saldo()
        assert.equal(resultado.saldo, "8.000")
        assert.equal(resultado.consistente, true)
        assert.equal(
          await prisma.kardex.count({ where: { id_empresa: empresas[0] } }),
          3,
        )
        assert.equal(
          await prisma.auditoria.count({ where: { id_empresa: empresas[0] } }),
          3,
        )
        assert.equal(
          await prisma.movimentacao_estoque.count({
            where: { id_empresa: empresas[1] },
          }),
          0,
        )
      },
    )
    await t.test(
      "saldo insuficiente e ajuste desatualizado não gravam nada",
      async () => {
        const antes = await snapshot()
        assert.equal(
          (await chamar(saidaHandler, { ...base, quantidade: "9" })).status,
          409,
        )
        assert.equal(
          (
            await chamar(ajusteHandler, {
              ...base,
              saldoNovo: "0",
              saldoEsperado: "10",
            })
          ).status,
          409,
        )
        assert.equal(
          (
            await chamar(ajusteHandler, {
              ...base,
              saldoNovo: "8",
              saldoEsperado: "8",
            })
          ).status,
          400,
        )
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "duas baixas simultâneas: somente uma consome e saldo nunca fica negativo",
      async () => {
        const results = await Promise.all([
          chamar(saidaHandler, { ...base, quantidade: "6" }),
          chamar(saidaHandler, { ...base, quantidade: "6" }),
        ])
        assert.deepEqual(
          results.map((r) => r.status).sort(),
          [201, 409],
          await Promise.all(results.map((r) => r.clone().text())).then(
            JSON.stringify,
          ),
        )
        assert.equal((await saldo()).saldo, "2.000")
        assert.equal(
          await prisma.kardex.count({ where: { id_empresa: empresas[0] } }),
          4,
        )
      },
    )
    await t.test(
      "ajustes simultâneos com mesmo esperado não sobrescrevem",
      async () => {
        const results = await Promise.all([
          chamar(ajusteHandler, {
            ...base,
            saldoNovo: "3",
            saldoEsperado: "2",
          }),
          chamar(ajusteHandler, {
            ...base,
            saldoNovo: "4",
            saldoEsperado: "2",
          }),
        ])
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
        assert.ok(["3.000", "4.000"].includes((await saldo()).saldo))
      },
    )
    await t.test(
      "permissão revogada e usuário inativo bloqueiam token ainda válido",
      async () => {
        await prisma.permissoes_usuario.update({
          where: { id: permissao.id },
          data: { pode_criar: false, pode_editar: false },
        })
        assert.equal(
          (await chamar(entradaHandler, { ...base, quantidade: "1" })).status,
          403,
        )
        assert.equal(
          (
            await chamar(ajusteHandler, {
              ...base,
              saldoNovo: "0",
              saldoEsperado: "2",
            })
          ).status,
          403,
        )
        await prisma.usuarios.update({
          where: { id: usuario.id },
          data: { status: "INATIVO" },
        })
        assert.equal(
          (await chamar(entradaHandler, { ...base, quantidade: "1" })).status,
          403,
        )
        await prisma.usuarios.update({
          where: { id: usuario.id },
          data: { status: "ATIVO" },
        })
        await prisma.permissoes_usuario.update({
          where: { id: permissao.id },
          data: { pode_criar: true, pode_editar: true },
        })
      },
    )
    await t.test(
      "falha de integridade após atualizar o saldo desfaz toda a escrita",
      async () => {
        const idUsuarioInexistente = 2147483647
        assert.equal(
          await prisma.usuarios.findUnique({
            where: { id: idUsuarioInexistente },
          }),
          null,
        )
        const { movimentar } =
          await import("../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository.ts")
        const antes = await snapshot()
        // A projeção é atualizada antes do INSERT do movimento. A FK do usuário
        // força uma falha nesse INSERT e deve reverter também a projeção.
        await assert.rejects(
          () =>
            movimentar(
              { idEmpresa: empresas[0], idUsuario: idUsuarioInexistente },
              { ...base, quantidade: "0.001" },
              "entrada",
            ),
          (error) => error.status === 409,
        )
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "projeção divergente é detectada; consulta nunca corrige silenciosamente",
      async () => {
        await prisma.estoque.updateMany({
          where: { id_empresa: empresas[0] },
          data: { quantidade: "99" },
        })
        const antes = await snapshot()
        assert.equal((await saldo()).consistente, false)
        assert.equal(
          (await chamar(entradaHandler, { ...base, quantidade: "1" })).status,
          409,
        )
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "abertura legada é auditada e rollback inclui a abertura",
      async () => {
        const local = await prisma.locais_estoque.create({
          data: { id_empresa: empresas[0], nome: `${marker}-legado` },
        })
        const setor = await prisma.setores.create({
          data: { id_empresa: empresas[0], nome: `${marker}-legado` },
        })
        await prisma.estoque.create({
          data: {
            id_empresa: empresas[0],
            id_local_estoque: local.id,
            id_setor: setor.id,
            id_produto: produto.id,
            quantidade: "5",
            quantidade_reservada: "1",
          },
        })
        const legado = { ...base, idLocalEstoque: local.id, idSetor: setor.id }
        const antes = await snapshot()
        assert.equal(
          (await chamar(saidaHandler, { ...legado, quantidade: "6" })).status,
          409,
        )
        assert.equal(await snapshot(), antes)
        const result = await ok(saidaHandler, { ...legado, quantidade: "2" })
        assert.ok(result.idMovimentacaoAbertura)
        assert.equal(result.saldoAnterior, "5.000")
        assert.equal(result.saldoAtual, "3.000")
        const row = await prisma.estoque.findFirst({
          where: { id_empresa: empresas[0], id_local_estoque: local.id },
        })
        assert.equal(row.quantidade_reservada.toFixed(3), "1.000")
      },
    )
    await t.test(
      "abertura comprovada de compras mantém livro, projeção e auditoria na mesma transação",
      async () => {
        const local = await prisma.locais_estoque.create({
          data: { id_empresa: empresas[0], nome: `${marker}-compras-legado` },
        })
        const setor = await prisma.setores.create({
          data: { id_empresa: empresas[0], nome: `${marker}-compras-legado` },
        })
        const posicao = { ...base, idLocalEstoque: local.id, idSetor: setor.id }
        await prisma.estoque.create({
          data: {
            id_empresa: empresas[0],
            id_local_estoque: local.id,
            id_setor: setor.id,
            id_produto: produto.id,
            quantidade: "15",
            quantidade_reservada: "1",
          },
        })
        const dataCompra = new Date("2026-10-01T12:00:00Z")
        const movimento = await prisma.movimentacao_estoque.create({
          data: {
            id_empresa: empresas[0],
            id_local_estoque: local.id,
            id_setor: setor.id,
            id_produto: produto.id,
            tipo: "ENTRADA_NF",
            quantidade: "5",
            origem_tipo: "COMPRA_RECEBIMENTO",
            id_usuario: usuario.id,
            data_movimentacao: dataCompra,
          },
        })
        await prisma.kardex.create({
          data: {
            id_empresa: empresas[0],
            id_local_estoque: local.id,
            id_setor: setor.id,
            id_produto: produto.id,
            id_movimentacao: movimento.id,
            tipo_movimentacao: "ENTRADA",
            quantidade: "5",
            saldo_anterior: "10",
            saldo_atual: "15",
            data_movimentacao: dataCompra,
          },
        })
        // A abertura também deve sumir se a baixa solicitada não puder concluir.
        const antes = await snapshot()
        assert.equal(
          (await chamar(saidaHandler, { ...posicao, quantidade: "16" })).status,
          409,
        )
        assert.equal(await snapshot(), antes)
        const resultado = await ok(saidaHandler, {
          ...posicao,
          quantidade: "2",
        })
        assert.equal(resultado.saldoAnterior, "15.000")
        assert.equal(resultado.saldoAtual, "13.000")
        assert.ok(resultado.idMovimentacaoAbertura)
        const abertura = await prisma.movimentacao_estoque.findUnique({
          where: { id: resultado.idMovimentacaoAbertura },
        })
        assert.equal(abertura.quantidade.toFixed(3), "10.000")
        assert.ok(abertura.data_movimentacao < dataCompra)
        const audit = await prisma.auditoria.findFirst({
          where: {
            tabela: "movimentacao_estoque",
            id_registro: abertura.id,
            id_empresa: empresas[0],
          },
        })
        assert.equal(JSON.parse(audit.dados_novos).fundamento, "KARDEX_COMPRAS")
        const consulta = await saldoHandler(
          new Request(
            `http://localhost/api/estoque/saldo?idProduto=${produto.id}&idLocalEstoque=${local.id}`,
            { headers },
          ),
        )
        const atual = await consulta.json()
        assert.equal(atual.saldo, "13.000")
        assert.equal(atual.consistente, true)
        assert.equal(atual.quantidadeReservada, "1.000")
        assert.equal(
          (await ok(entradaHandler, { ...posicao, quantidade: "1" }))
            .idMovimentacaoAbertura,
          null,
        )
      },
    )
    await t.test(
      "primeiras entradas concorrentes criam uma única posição sem perder quantidade",
      async () => {
        const novo = await prisma.produtos.create({
          data: {
            nome: `${marker}-concorrente`,
            codigo: `${marker}-2`,
            unidade: "KG",
            id_tipo_produto: tipos[0],
            controla_estoque: true,
          },
        })
        produtos.push(novo.id)
        await prisma.produto_empresa.create({
          data: { id_empresa: empresas[0], id_produto: novo.id },
        })
        const primeira = { ...base, idProduto: novo.id }
        const respostas = await Promise.all([
          chamar(entradaHandler, { ...primeira, quantidade: "1.001" }),
          chamar(entradaHandler, { ...primeira, quantidade: "2.001" }),
        ])
        assert.deepEqual(
          respostas.map((r) => r.status),
          [201, 201],
          await Promise.all(respostas.map((r) => r.clone().text())).then(
            JSON.stringify,
          ),
        )
        const rows = await prisma.estoque.findMany({
          where: { id_empresa: empresas[0], id_produto: novo.id },
        })
        assert.equal(rows.length, 1)
        assert.equal(rows[0].quantidade.toFixed(3), "3.002")
        const antes = await snapshot()
        assert.equal(
          (
            await chamar(entradaHandler, {
              ...primeira,
              quantidade: "999999999999.999",
            })
          ).status,
          400,
        )
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "empresa, vínculo, local e produto inativos negam novas movimentações",
      async () => {
        const tentativa = () =>
          chamar(entradaHandler, { ...base, quantidade: "1" })
        await prisma.empresas.update({
          where: { id: empresas[0] },
          data: { status: "INATIVA" },
        })
        assert.equal((await tentativa()).status, 403)
        await prisma.empresas.update({
          where: { id: empresas[0] },
          data: { status: "ATIVA" },
        })
        await prisma.usuario_empresa.update({
          where: { id: vinculo.id },
          data: { status: "INATIVO" },
        })
        assert.equal((await tentativa()).status, 403)
        await prisma.usuario_empresa.update({
          where: { id: vinculo.id },
          data: { status: "ATIVO" },
        })
        await prisma.locais_estoque.update({
          where: { id: locais[0].id },
          data: { status: "INATIVO" },
        })
        assert.equal((await tentativa()).status, 404)
        await prisma.locais_estoque.update({
          where: { id: locais[0].id },
          data: { status: "ATIVO" },
        })
        await prisma.produtos.update({
          where: { id: produto.id },
          data: { controla_estoque: false },
        })
        assert.equal((await tentativa()).status, 404)
        await prisma.produtos.update({
          where: { id: produto.id },
          data: { controla_estoque: true },
        })
      },
    )
  } finally {
    if (server && server.exitCode === null) {
      const encerrado = once(server, "exit")
      server.kill()
      await encerrado
    }
    if (prisma) {
      try {
        // Limpeza restrita aos IDs das empresas e produtos criados nesta execução.
        if (empresas.length) {
          for (const model of [
            "auditoria",
            "kardex",
            "movimentacao_estoque",
            "estoque",
          ])
            await prisma[model].deleteMany({
              where: { id_empresa: { in: empresas } },
            })
          const vinculos = await prisma.usuario_empresa.findMany({
            where: { id_empresa: { in: empresas } },
            select: { id: true },
          })
          await prisma.permissoes_usuario.deleteMany({
            where: { id_usuario_empresa: { in: vinculos.map((v) => v.id) } },
          })
          for (const model of [
            "usuario_empresa",
            "produto_empresa",
            "cargos",
            "setores",
            "locais_estoque",
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
