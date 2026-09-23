import { test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
import ts from "typescript"

const databaseUrl = process.env.ESTOQUE_MINIMO_TEST_DATABASE_URL

async function testarHttpReal({
  email,
  password,
  idEmpresa,
  idProduto,
  idLocal,
}) {
  const port = 43127
  const server = spawn(
    process.execPath,
    [
      path.resolve("node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  )
  let logs = ""
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      logs = (logs + String(chunk)).slice(-4000)
    })
  }
  try {
    const base = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 30000
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Next encerrou: ${logs}`)
      try {
        const response = await fetch(`${base}/login`)
        if (response.ok) break
      } catch {
        // O servidor ainda está iniciando.
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    assert.ok(Date.now() < deadline, `Next não iniciou: ${logs}`)
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (login.status !== 200) assert.fail(`Login real: ${await login.text()}`)
    const { accessToken } = await login.json()
    assert.ok(accessToken)
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "X-Empresa-Id": String(idEmpresa),
    }
    assert.equal(
      (await fetch(`${base}/api/estoque-minimo`)).status,
      401,
      "rota HTTP exige JWT",
    )
    const consulta = await fetch(`${base}/api/estoque-minimo`, { headers })
    if (consulta.status !== 200)
      assert.fail(`Consulta HTTP: ${await consulta.text()}`)
    const lista = await consulta.json()
    assert.ok(lista.posicoes.some((item) => item.idProduto === idProduto))
    assert.equal(lista.indicador.total, 4)
    const gravacao = await fetch(`${base}/api/estoque-minimo`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        idProduto,
        idLocalEstoque: idLocal,
        quantidadeMinima: "6.000",
      }),
    })
    if (gravacao.status !== 200)
      assert.fail(`Gravação HTTP: ${await gravacao.text()}`)
    assert.equal((await gravacao.json()).configuracao.quantidadeMinima, "6.000")
  } finally {
    server.kill()
  }
}

test(
  "Banco real: mínimo por local, dashboard, autorização, isolamento e rollback",
  {
    skip:
      !databaseUrl &&
      "Defina ESTOQUE_MINIMO_TEST_DATABASE_URL para um MySQL/MariaDB local isolado.",
  },
  async () => {
    const url = new URL(databaseUrl)
    assert.equal(url.protocol, "mysql:")
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    assert.ok(url.pathname.length > 1, "Informe o banco local de testes")
    process.env.DATABASE_URL = databaseUrl
    process.env.ACCESS_TOKEN_SECRET = "estoque-minimo-integration-local-only"

    const { registerHooks } = await import("node:module")
    const hooks = registerHooks({
      resolve(specifier, context, next) {
        if (specifier === "server-only") {
          return { url: "data:text/javascript,export {};", shortCircuit: true }
        }
        const candidate = specifier.startsWith("@/")
          ? pathToFileURL(path.resolve("src", specifier.slice(2))).href
          : specifier.startsWith(".")
            ? new URL(specifier, context.parentURL).href
            : null
        if (
          candidate?.startsWith("file:") &&
          existsSync(fileURLToPath(candidate + ".ts"))
        ) {
          return { url: candidate + ".ts", shortCircuit: true }
        }
        return next(specifier, context)
      },
      load(url, context, next) {
        if (url.startsWith("file:") && url.endsWith(".ts")) {
          return {
            format: "module",
            shortCircuit: true,
            source: ts.transpileModule(
              readFileSync(fileURLToPath(url), "utf8"),
              {
                compilerOptions: {
                  module: ts.ModuleKind.ESNext,
                  target: ts.ScriptTarget.ES2022,
                },
              },
            ).outputText,
          }
        }
        return next(url, context)
      },
    })

    let prisma
    const empresas = []
    const usuarios = []
    const produtos = []
    const tipos = []
    const marker = randomUUID().slice(0, 8)
    try {
      ;({ prisma } = await import("../src/lib/prisma.ts"))
      const { autorizarEstoque } =
        await import("../src/modules/estoque-minimo/estoque-minimo.authorization.ts")
      const { listarPosicoes: listarPosicoesComContexto, salvarMinimoLocal } =
        await import("../src/modules/estoque-minimo/estoque-minimo.repository.ts")
      const { listarHandler, configurarHandler, empresasHandler } =
        await import("../src/modules/estoque-minimo/router.ts")
      const { signAccessToken, hashPassword } =
        await import("../src/modules/auth/auth.service.ts")

      const request = (idUsuario, idEmpresa, method = "GET", body) =>
        new Request("http://localhost/api/estoque-minimo", {
          method,
          headers: {
            Authorization: `Bearer ${signAccessToken({ id: idUsuario, role: "PRODUCAO" })}`,
            "X-Empresa-Id": String(idEmpresa),
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        })

      for (let indice = 0; indice < 2; indice++) {
        const empresa = await prisma.empresas.create({
          data: {
            razao_social: `Estoque teste ${marker} ${indice}`,
            cnpj: `${Date.now()}${indice}`,
          },
        })
        empresas.push(empresa.id)
      }

      const senhaHttp = `Estoque-${marker}-Senha-Forte!`
      const admin = await prisma.usuarios.create({
        data: {
          nome: "Admin estoque",
          email: `${marker}-admin@estoque.example.test`,
          senha: await hashPassword(senhaHttp),
          nivel_acesso: "ADMIN",
        },
      })
      const usuario = await prisma.usuarios.create({
        data: {
          nome: "Leitor estoque",
          email: `${marker}-leitor@estoque.example.test`,
          senha: "fixture-sem-login",
        },
      })
      usuarios.push(admin.id, usuario.id)
      const cargo = await prisma.cargos.create({
        data: { id_empresa: empresas[0], nome: `Estoque ${marker}` },
      })
      await prisma.usuario_empresa.create({
        data: {
          id_usuario: admin.id,
          id_empresa: empresas[0],
          id_cargo: cargo.id,
        },
      })
      const vinculoLeitor = await prisma.usuario_empresa.create({
        data: {
          id_usuario: usuario.id,
          id_empresa: empresas[0],
          id_cargo: cargo.id,
        },
      })

      const tipoInsumo = await prisma.tipos_produto.create({
        data: { nome: `Tecido ${marker}` },
      })
      const tipoAcabado = await prisma.tipos_produto.create({
        data: { nome: `Produto acabado ${marker}` },
      })
      tipos.push(tipoInsumo.id, tipoAcabado.id)

      const definicoes = [
        ["Tecido principal", tipoInsumo.id, true, false],
        ["Camisa pronta", tipoAcabado.id, false, true],
        ["Produto regular", tipoAcabado.id, false, true],
        ["Produto sem mínimo", tipoAcabado.id, false, true],
        ["Produto outra empresa", tipoAcabado.id, false, true],
      ]
      for (const [nome, idTipo, permiteCompra, permiteVenda] of definicoes) {
        const produto = await prisma.produtos.create({
          data: {
            nome,
            codigo: `${marker}-${produtos.length}`,
            unidade: permiteCompra ? "m" : "UN",
            id_tipo_produto: idTipo,
            permite_compra: permiteCompra,
            permite_venda: permiteVenda,
          },
        })
        produtos.push(produto.id)
      }
      for (const idProduto of produtos.slice(0, 4)) {
        await prisma.produto_empresa.create({
          data: { id_empresa: empresas[0], id_produto: idProduto },
        })
      }
      await prisma.produto_empresa.create({
        data: { id_empresa: empresas[1], id_produto: produtos[4] },
      })

      const fabrica = await prisma.locais_estoque.create({
        data: { id_empresa: empresas[0], nome: `Fábrica ${marker}` },
      })
      const loja = await prisma.locais_estoque.create({
        data: { id_empresa: empresas[0], nome: `Loja ${marker}` },
      })
      const outroLocal = await prisma.locais_estoque.create({
        data: { id_empresa: empresas[1], nome: `Outra empresa ${marker}` },
      })
      const setorFabrica = await prisma.setores.create({
        data: { id_empresa: empresas[0], nome: `Fábrica ${marker}` },
      })
      const setorLoja = await prisma.setores.create({
        data: { id_empresa: empresas[0], nome: `Loja ${marker}` },
      })
      const outroSetor = await prisma.setores.create({
        data: { id_empresa: empresas[1], nome: `Outro ${marker}` },
      })

      const saldos = [
        [empresas[0], fabrica.id, setorFabrica.id, produtos[0], "5", "999"],
        [empresas[0], loja.id, setorLoja.id, produtos[0], "2", "0"],
        [empresas[0], fabrica.id, setorFabrica.id, produtos[1], "0", "25"],
        [empresas[0], fabrica.id, setorFabrica.id, produtos[2], "10", "0"],
        [empresas[0], fabrica.id, setorFabrica.id, produtos[3], "1", "0"],
        [empresas[1], outroLocal.id, outroSetor.id, produtos[4], "0", "0"],
      ]
      for (const [
        idEmpresa,
        idLocal,
        idSetor,
        idProduto,
        quantidade,
        reservada,
      ] of saldos) {
        await prisma.estoque.create({
          data: {
            id_empresa: idEmpresa,
            id_local_estoque: idLocal,
            id_setor: idSetor,
            id_produto: idProduto,
            quantidade,
            quantidade_reservada: reservada,
          },
        })
      }

      const contexto = { idUsuario: admin.id, idEmpresa: empresas[0] }
      for (const [idProduto, idLocalEstoque, quantidadeMinima] of [
        [produtos[0], fabrica.id, "5"],
        [produtos[0], loja.id, "7"],
        [produtos[1], fabrica.id, "1"],
        [produtos[2], fabrica.id, "2"],
      ]) {
        await salvarMinimoLocal(contexto, {
          idProduto,
          idLocalEstoque,
          quantidadeMinima,
        })
      }
      await salvarMinimoLocal(contexto, {
        idProduto: produtos[0],
        idLocalEstoque: fabrica.id,
        quantidadeMinima: "5",
      })
      assert.equal(
        await prisma.estoque_minimo_local.count({
          where: { id_empresa: empresas[0] },
        }),
        4,
        "upsert repetido não duplica a configuração",
      )

      await prisma.estoque_minimo_local.create({
        data: {
          id_empresa: empresas[1],
          id_local_estoque: outroLocal.id,
          id_produto: produtos[4],
          quantidade_minima: "8",
        },
      })

      const acesso = await autorizarEstoque(
        request(admin.id, empresas[0]),
        "editar",
      )
      assert.deepEqual(
        { idUsuario: acesso.idUsuario, idEmpresa: acesso.idEmpresa },
        contexto,
      )
      await assert.rejects(
        autorizarEstoque(request(usuario.id, empresas[0]), "ler"),
        (erro) => erro.status === 403,
      )
      await prisma.permissoes_usuario.create({
        data: {
          id_usuario_empresa: vinculoLeitor.id,
          recurso: "ESTOQUE",
          pode_ler: true,
        },
      })
      assert.equal(
        (await autorizarEstoque(request(usuario.id, empresas[0]), "ler"))
          .idUsuario,
        usuario.id,
      )
      await assert.rejects(
        autorizarEstoque(request(usuario.id, empresas[0]), "editar"),
        (erro) => erro.status === 403,
      )
      assert.equal(
        (
          await configurarHandler(
            request(usuario.id, empresas[0], "PUT", {
              idProduto: produtos[0],
              idLocalEstoque: fabrica.id,
              quantidadeMinima: "5.000",
            }),
          )
        ).status,
        403,
      )
      await prisma.permissoes_usuario.update({
        where: {
          id_usuario_empresa_recurso: {
            id_usuario_empresa: vinculoLeitor.id,
            recurso: "ESTOQUE",
          },
        },
        data: { pode_editar: true },
      })
      assert.equal(
        (await autorizarEstoque(request(usuario.id, empresas[0]), "editar"))
          .idUsuario,
        usuario.id,
      )

      const todas = await listarPosicoesComContexto(contexto)
      assert.equal(todas.length, 5)
      assert.ok(todas.every((item) => !item.produto.includes("outra empresa")))
      const porId = new Map(
        todas.map((item) => [item.idProduto + ":" + item.idLocalEstoque, item]),
      )
      assert.equal(
        porId.get(`${produtos[0]}:${fabrica.id}`).estado,
        "NO_MINIMO",
      )
      assert.equal(
        porId.get(`${produtos[0]}:${loja.id}`).estado,
        "ABAIXO_MINIMO",
      )
      assert.equal(porId.get(`${produtos[0]}:${loja.id}`).deficit, "5.000")
      assert.equal(
        porId.get(`${produtos[1]}:${fabrica.id}`).estado,
        "SEM_ESTOQUE",
      )
      assert.equal(porId.get(`${produtos[2]}:${fabrica.id}`).estado, "REGULAR")
      assert.equal(
        porId.get(`${produtos[3]}:${fabrica.id}`).estado,
        "NAO_CONFIGURADO",
      )
      assert.equal(
        porId.get(`${produtos[0]}:${fabrica.id}`).estado,
        "NO_MINIMO",
        "quantidade reservada não altera o alerta físico",
      )

      const insumos = await listarPosicoesComContexto(contexto, true)
      assert.deepEqual(
        insumos.map((item) => item.idProduto),
        [produtos[0], produtos[0]],
      )

      const anteriorNodeEnv = process.env.NODE_ENV
      let resposta
      try {
        process.env.NODE_ENV = "production"
        resposta = await listarHandler(request(admin.id, empresas[0]))
      } finally {
        if (anteriorNodeEnv === undefined) delete process.env.NODE_ENV
        else process.env.NODE_ENV = anteriorNodeEnv
      }
      assert.equal(resposta.status, 200)
      const tela = await resposta.json()
      const dashboard = tela.indicador
      assert.equal(tela.posicoes.length, todas.length)
      assert.equal(dashboard.total, 3)
      assert.equal(dashboard.semEstoque, 1)
      assert.equal(dashboard.semMinimo, 1)
      assert.equal(dashboard.totalMonitorados, 4)
      assert.deepEqual(
        dashboard.maisCriticos?.map((item) => item.id),
        tela.posicoes
          .filter((item) =>
            ["SEM_ESTOQUE", "ABAIXO_MINIMO", "NO_MINIMO"].includes(item.estado),
          )
          .slice(0, 3)
          .map((item) => item.idEstoque),
        "dashboard e listagem derivam das mesmas posições reais",
      )

      assert.equal(
        (
          await listarHandler(
            new Request("http://localhost/api/estoque-minimo"),
          )
        ).status,
        401,
        "consulta sem JWT não é autorizada",
      )
      assert.equal(
        (await listarHandler(request(admin.id, 2147483647))).status,
        403,
        "header de empresa alheia não concede acesso",
      )
      assert.equal(
        (
          await configurarHandler(
            request(admin.id, empresas[0], "PUT", {
              idProduto: produtos[0],
              idLocalEstoque: fabrica.id,
              quantidadeMinima: "-1",
            }),
          )
        ).status,
        400,
      )
      const empresasResponse = await empresasHandler(
        request(admin.id, empresas[0]),
      )
      assert.equal(empresasResponse.status, 200)
      assert.deepEqual(
        (await empresasResponse.json()).empresas.map((item) => item.id),
        [empresas[0]],
      )
      await assert.rejects(
        salvarMinimoLocal(contexto, {
          idProduto: produtos[4],
          idLocalEstoque: outroLocal.id,
          quantidadeMinima: "9",
        }),
        (erro) => erro.status === 400,
      )
      await assert.rejects(
        prisma.estoque_minimo_local.create({
          data: {
            id_empresa: empresas[0],
            id_local_estoque: outroLocal.id,
            id_produto: produtos[0],
            quantidade_minima: "9",
          },
        }),
        (erro) => erro.code === "P2003",
        "a FK composta bloqueia local de outra empresa",
      )

      await assert.rejects(
        salvarMinimoLocal(
          { idUsuario: 2147483647, idEmpresa: empresas[0] },
          {
            idProduto: produtos[3],
            idLocalEstoque: fabrica.id,
            quantidadeMinima: "4",
          },
        ),
        (erro) => erro.status === 409,
      )
      assert.equal(
        await prisma.estoque_minimo_local.count({
          where: {
            id_empresa: empresas[0],
            id_local_estoque: fabrica.id,
            id_produto: produtos[3],
          },
        }),
        0,
        "falha de auditoria reverte a configuração inteira",
      )
      assert.ok(
        (await prisma.auditoria.count({
          where: {
            id_empresa: empresas[0],
            tabela: "estoque_minimo_local",
          },
        })) >= 5,
      )

      const configuracaoResponse = await configurarHandler(
        request(admin.id, empresas[0], "PUT", {
          idProduto: produtos[3],
          idLocalEstoque: fabrica.id,
          quantidadeMinima: "4.000",
        }),
      )
      assert.equal(configuracaoResponse.status, 200)
      assert.equal(
        (await configuracaoResponse.json()).configuracao.quantidadeMinima,
        "4.000",
      )
      assert.equal(
        (
          await configurarHandler(
            request(admin.id, empresas[0], "PUT", {
              idProduto: produtos[3],
              idLocalEstoque: fabrica.id,
              quantidadeMinima: "4.000",
            }),
          )
        ).status,
        200,
      )
      assert.equal(
        await prisma.estoque_minimo_local.count({
          where: { id_empresa: empresas[0], id_produto: produtos[3] },
        }),
        1,
        "PUT repetido não duplica mínimo local",
      )
      if (process.argv.includes("--http")) {
        await testarHttpReal({
          email: admin.email,
          password: senhaHttp,
          idEmpresa: empresas[0],
          idProduto: produtos[3],
          idLocal: fabrica.id,
        })
      }
    } finally {
      if (prisma) {
        try {
          await prisma.estoque_minimo_local.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.estoque.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.auditoria.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.usuario_empresa.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.cargos.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.setores.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.locais_estoque.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.produto_empresa.deleteMany({
            where: { id_empresa: { in: empresas } },
          })
          await prisma.produtos.deleteMany({ where: { id: { in: produtos } } })
          await prisma.tipos_produto.deleteMany({
            where: { id: { in: tipos } },
          })
          await prisma.usuarios.deleteMany({ where: { id: { in: usuarios } } })
          await prisma.empresas.deleteMany({ where: { id: { in: empresas } } })
        } finally {
          await prisma.$disconnect()
        }
      }
      hooks.deregister()
    }
  },
)
