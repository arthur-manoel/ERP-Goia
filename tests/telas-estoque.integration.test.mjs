import assert from "node:assert/strict"
import { randomUUID, randomBytes } from "node:crypto"
import { test } from "node:test"
import {
  bancoLocal,
  httpProducao,
  typescript,
} from "./helpers/integracao-pedidos.mjs"

const url = bancoLocal(process.env.TELAS_ESTOQUE_TEST_DATABASE_URL)
process.env.DATABASE_URL = url.href
process.env.ACCESS_TOKEN_SECRET = randomBytes(32).toString("hex")

test("Movimentos manuais, Kardex e exportações autorizadas por HTTP", async (t) => {
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const { hashPassword } = await import("../src/modules/auth/auth.service.ts")
  let server
  try {
    const app = await httpProducao()
    server = app.server
    const uid = randomUUID()
    const identificador = String(
      BigInt("0x" + randomBytes(5).toString("hex")),
    ).padStart(13, "0")
    const empresa = await prisma.empresas.create({
      data: { razao_social: `Empresa Ção ${uid}`, cnpj: identificador + "1" },
    })
    const outra = await prisma.empresas.create({
      data: { razao_social: `Outra ${uid}`, cnpj: identificador + "2" },
    })
    const cargo = await prisma.cargos.create({
      data: { id_empresa: empresa.id, nome: "Produção" },
    })
    const email = `${uid}@estoque.example.test`
    const senha = randomBytes(24).toString("hex")
    const usuario = await prisma.usuarios.create({
      data: { nome: "Conferente", email, senha: await hashPassword(senha) },
    })
    const vinculo = await prisma.usuario_empresa.create({
      data: {
        id_empresa: empresa.id,
        id_usuario: usuario.id,
        id_cargo: cargo.id,
        nivel_acesso: "USUARIO",
      },
    })
    const estoquePerm = await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculo.id,
        recurso: "ESTOQUE",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
      },
    })
    const relatorios = await prisma.permissoes_usuario.create({
      data: {
        id_usuario_empresa: vinculo.id,
        recurso: "RELATORIOS",
        pode_ler: true,
      },
    })
    const tipo = await prisma.tipos_produto.create({
      data: { nome: `Insumo ${uid}` },
    })
    const produto = await prisma.produtos.create({
      data: {
        id_tipo_produto: tipo.id,
        codigo: uid,
        nome: 'Tecido "Algodão"; cru',
        controla_estoque: true,
        unidade: "M",
      },
    })
    await prisma.produto_empresa.create({
      data: { id_empresa: empresa.id, id_produto: produto.id },
    })
    const cor = await prisma.cores.create({
      data: { id_empresa: empresa.id, nome: "Azul" },
    })
    const variacao = await prisma.produto_variacoes.create({
      data: { id_empresa: empresa.id, id_produto: produto.id, id_cor: cor.id },
    })
    const local = await prisma.locais_estoque.create({
      data: { id_empresa: empresa.id, nome: "Depósito" },
    })
    const setor = await prisma.setores.create({
      data: { id_empresa: empresa.id, nome: "Expedição" },
    })
    const externo = await prisma.locais_estoque.create({
      data: { id_empresa: outra.id, nome: "Posição externa" },
    })
    const login = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
    })
    assert.equal(login.status, 200)
    const { accessToken } = await login.json()
    const req = (path, body, chave, idEmpresa = empresa.id) =>
      fetch(app.base + path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Empresa-Id": String(idEmpresa),
          "Content-Type": "application/json",
          ...(chave ? { "Idempotency-Key": chave } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    const posicao = {
      idProduto: produto.id,
      idLocalEstoque: local.id,
      idSetor: setor.id,
    }
    const observacao = '=1+1; "revisão"\nSegunda linha da observação'
    const entrada = { ...posicao, quantidade: "0.300", observacao }
    const movimento = (rota, body, key = randomUUID()) =>
      req(`/api/estoque/${rota}`, body, key)
    const ledger = { id_empresa: empresa.id, id_produto: produto.id }
    const where = { where: ledger }
    const chave = randomUUID()
    const primeira = await movimento("entradas", entrada, chave)
    assert.equal(primeira.status, 201)
    const original = await primeira.json()
    const replay = await movimento("entradas", entrada, chave)
    assert.equal(replay.status, 200)
    assert.deepEqual(await replay.json(), original)
    assert.equal(
      (await movimento("entradas", { ...entrada, quantidade: "0.400" }, chave))
        .status,
      409,
    )
    assert.equal(
      (await movimento("entradas", { ...entrada, quantidade: "0.0001" }))
        .status,
      400,
    )
    assert.equal(
      (await movimento("entradas", { ...entrada, idLocalEstoque: externo.id }))
        .status,
      404,
    )
    assert.equal(
      (await movimento("saidas", { ...entrada, quantidade: "0.301" })).status,
      409,
    )
    const saida = await movimento("saidas", { ...entrada, quantidade: "0.200" })
    assert.equal(saida.status, 201)
    assert.equal((await saida.json()).saldoAtual, "0.100")
    assert.equal(
      (
        await movimento("ajustes", {
          ...posicao,
          saldoEsperado: "0.300",
          saldoNovo: "0.200",
          observacao,
        })
      ).status,
      409,
    )
    const ajuste = await movimento("ajustes", {
      ...posicao,
      saldoEsperado: "0.100",
      saldoNovo: "0.200",
      observacao,
    })
    assert.equal(ajuste.status, 201)
    assert.equal((await ajuste.json()).quantidade, "0.100")
    const dupla = randomUUID()
    const respostas = await Promise.all([
      movimento("entradas", { ...entrada, idVariacao: variacao.id }, dupla),
      movimento("entradas", { ...entrada, idVariacao: variacao.id }, dupla),
    ])
    assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 201])
    assert.deepEqual(await respostas[0].json(), await respostas[1].json())
    assert.equal(await prisma.movimentacao_estoque.count(where), 4)
    assert.equal(await prisma.kardex.count(where), 4)
    assert.equal(
      await prisma.auditoria.count({
        where: {
          id_empresa: empresa.id,
          id_usuario: usuario.id,
          tabela: "movimentacao_estoque",
          acao: "INSERT",
        },
      }),
      4,
    )
    const outroLocal = await prisma.locais_estoque.create({
      data: { id_empresa: empresa.id, nome: "Outro depósito da mesma empresa" },
    })
    const chavePosicao = randomUUID()
    for (let i = 0; i < 2; i++) {
      const resposta = await movimento(
        "entradas",
        { ...entrada, idLocalEstoque: outroLocal.id },
        chavePosicao,
      )
      assert.equal(resposta.status, 409)
      assert.equal((await resposta.json()).code, "ESTOQUE_RECUSADO")
    }
    assert.equal(await prisma.estoque.count(where), 1)
    const pos = await prisma.estoque.findFirstOrThrow(where)
    assert.equal(pos.quantidade.toFixed(3), "0.500")
    await prisma.estoque.update({
      where: { id: pos.id },
      data: { quantidade_reservada: "0.450" },
    })
    assert.equal(
      (await movimento("saidas", { ...entrada, quantidade: "0.100" })).status,
      409,
    )
    const filtro = `idProduto=${produto.id}&idLocalEstoque=${local.id}`
    const grade = await (
      await req(`/api/estoque/kardex?${filtro}&idVariacao=${variacao.id}`)
    ).json()
    assert.equal(grade.dados.length, 1)
    assert.equal(grade.dados[0].saldo.escopo, "POSICAO_AGREGADA")
    assert.equal(grade.dados[0].saldo.anterior, "0.200")
    assert.equal(grade.dados[0].saldo.posterior, "0.500")
    assert.equal(
      (await req("/api/estoque/kardex", null, null, outra.id)).status,
      403,
    )
    const cat = await (await req("/api/estoque/movimentacoes/catalogo")).json()
    assert.ok(cat.locais.some((l) => l.id === local.id))
    assert.ok(!cat.locais.some((l) => l.id === externo.id))
    await t.test(
      "busca de grade considera todo o catálogo autorizado",
      async () => {
        const prefixo = `RECORTE-${uid}-`
        const lote = Array.from({ length: 501 }, (_, i) => ({
          id_tipo_produto: tipo.id,
          codigo: prefixo + i,
          nome: i === 500 ? "ZZ Produto do recorte" : "AA Produto do recorte",
          unidade: "M",
        }))
        await prisma.produtos.createMany({ data: lote })
        const itens = await prisma.produtos.findMany({
          where: { codigo: { startsWith: prefixo } },
          select: { id: true, codigo: true },
        })
        await prisma.produto_empresa.createMany({
          data: itens.map((item) => ({
            id_produto: item.id,
            id_empresa: empresa.id,
          })),
        })
        const alvo = itens.find((item) => item.codigo === prefixo + "500")
        assert.ok(alvo)
        const corRara = await prisma.cores.create({
          data: { id_empresa: empresa.id, nome: `Ocre ${uid}` },
        })
        const corLegada = await prisma.cores.create({
          data: { id_empresa: empresa.id, nome: `Oliva ${uid}` },
        })
        await prisma.produto_variacoes.createMany({
          data: Array.from({ length: 500 }, () => ({
            id_empresa: empresa.id,
            id_produto: alvo.id,
            id_cor: corLegada.id,
            status: "INATIVO",
          })),
        })
        const grade = await prisma.produto_variacoes.create({
          data: {
            id_empresa: empresa.id,
            id_produto: alvo.id,
            id_cor: corRara.id,
          },
        })
        const url = "/api/estoque/movimentacoes/catalogo"
        const resultado = await req(
          `${url}?variacao=${encodeURIComponent(corRara.nome)}`,
        )
        assert.equal(resultado.status, 200)
        const encontrado = await resultado.json()
        assert.equal(encontrado.excedeu.produto, true)
        assert.ok(!encontrado.produtos.some((p) => p.id === alvo.id))
        assert.deepEqual(
          encontrado.variacoes.map((v) => v.id),
          [grade.id],
        )
        const soAtivas = await (await req(`${url}?idProduto=${alvo.id}`)).json()
        assert.deepEqual(
          soAtivas.variacoes.map((v) => v.id),
          [grade.id],
        )
        assert.equal(soAtivas.excedeu.variacao, false)
        const opcoesDoFormulario = await req(`${url}?idProduto=${produto.id}`)
        assert.equal(opcoesDoFormulario.status, 200)
        const gradeDoFormulario = await opcoesDoFormulario.json()
        assert.deepEqual(
          gradeDoFormulario.produtos.map((p) => p.id),
          [produto.id],
        )
        assert.deepEqual(
          gradeDoFormulario.variacoes.map((v) => v.id),
          [variacao.id],
        )
      },
    )
    await t.test(
      "Produto legado e identidades que diferem por caixa",
      async () => {
        const historico = await prisma.produtos.create({
          data: {
            id_tipo_produto: tipo.id,
            codigo: uid + "-legado",
            nome: "Pano legado",
            controla_estoque: true,
            unidade: "M",
          },
        })
        await prisma.movimentacao_estoque.create({
          data: {
            ...ledger,
            id_produto: historico.id,
            id_usuario: usuario.id,
            id_local_estoque: local.id,
            id_setor: setor.id,
            tipo: "AJUSTE_ENTRADA",
            quantidade: "1.000",
            origem_tipo: "API_ENTRADA",
            observacao: "＝1+1, conferência Ω",
          },
        })
        const q = `idProduto=${historico.id}`
        assert.equal((await req(`/api/estoque/movimentacoes?${q}`)).status, 200)
        assert.equal((await req(`/api/estoque/kardex?${q}`)).status, 404)
        const catalogo = await (
          await req("/api/estoque/movimentacoes/catalogo?produto=Pano%20legado")
        ).json()
        assert.deepEqual(
          catalogo.produtos.map((p) => [p.id, p.ativo]),
          [[historico.id, false]],
        )
        const csv = await req(
          `/api/estoque/movimentacoes/exportar?${q}&formato=csv`,
        )
        assert.equal(csv.status, 200)
        assert.ok((await csv.text()).includes("'＝1+1, conferência Ω"))
        const localNovo = await prisma.locais_estoque.create({
          data: { id_empresa: empresa.id, nome: "Posição de identidade" },
        })
        const setorNovo = await prisma.setores.create({
          data: { id_empresa: empresa.id, nome: "Setor de identidade" },
        })
        const produtoNovo = await prisma.produtos.create({
          data: {
            id_tipo_produto: tipo.id,
            codigo: uid + "-chave",
            nome: "Chave",
            controla_estoque: true,
            unidade: "M",
          },
        })
        await prisma.produto_empresa.create({
          data: { id_empresa: empresa.id, id_produto: produtoNovo.id },
        })
        const corpo = {
          ...entrada,
          idProduto: produtoNovo.id,
          idLocalEstoque: localNovo.id,
          idSetor: setorNovo.id,
        }
        assert.equal(
          (await movimento("entradas", corpo, "Teste123")).status,
          201,
        )
        assert.equal(
          (await movimento("entradas", corpo, "teste123")).status,
          201,
        )
        assert.equal(
          (await movimento("entradas", corpo, "Teste123")).status,
          200,
        )
        const chaveRecusada = randomUUID()
        const impossivel = { ...corpo, quantidade: "0.700" }
        const falhou = await movimento("saidas", impossivel, chaveRecusada)
        assert.equal(falhou.status, 409)
        assert.equal((await falhou.json()).code, "ESTOQUE_RECUSADO")
        assert.equal((await movimento("entradas", corpo)).status, 201)
        const recusadaNovamente = await movimento(
          "saidas",
          impossivel,
          chaveRecusada,
        )
        assert.equal(recusadaNovamente.status, 409)
        assert.equal((await recusadaNovamente.json()).code, "ESTOQUE_RECUSADO")
        const autorizada = await movimento("saidas", impossivel)
        assert.equal(autorizada.status, 201)
        assert.equal((await autorizada.json()).saldoAtual, "0.200")
        const opcoesKardex = await (
          await req(
            "/api/estoque/movimentacoes/catalogo?escopo=kardex&produto=Pano%20legado",
          )
        ).json()
        assert.deepEqual(opcoesKardex.produtos, [])
      },
    )
    await t.test(
      "Exportação usa o conjunto filtrado e preserva os registros",
      async () => {
        // Monta volume controlado repetindo o fato de teste somente na base isolada.
        for (let i = 0; i < 27; i++) {
          const m = await prisma.movimentacao_estoque.create({
            data: {
              ...ledger,
              id_usuario: usuario.id,
              id_local_estoque: local.id,
              id_setor: setor.id,
              tipo: "AJUSTE_ENTRADA",
              quantidade: "0.300",
              origem_tipo: "API_ENTRADA",
              observacao,
            },
          })
          await prisma.kardex.create({
            data: {
              ...ledger,
              id_movimentacao: m.id,
              id_local_estoque: local.id,
              id_setor: setor.id,
              tipo_movimentacao: "ENTRADA",
              quantidade: "0.300",
              saldo_anterior: "0.000",
              saldo_atual: "0.300",
            },
          })
        }
        const antes = await prisma.estoque.findFirstOrThrow(where)
        const quantidadeMovimentos =
          await prisma.movimentacao_estoque.count(where)
        const quantidadeKardex = await prisma.kardex.count(where)
        assert.equal(quantidadeMovimentos, 31)
        for (const escopo of ["movimentacoes", "kardex"]) {
          const rota = `/api/estoque/${escopo}`
          const p1 = await (await req(`${rota}?${filtro}&pagina=1`)).json()
          const p2 = await (await req(`${rota}?${filtro}&pagina=2`)).json()
          assert.equal(p1.dados.length, 25)
          assert.equal(p2.dados.length, 6)
          assert.equal(p1.paginacao.totalPaginas, 2)
          assert.equal(
            new Set([...p1.dados, ...p2.dados].map((r) => r.id)).size,
            31,
          )
          const csv = await req(`${rota}/exportar?${filtro}&formato=csv`)
          assert.equal(csv.status, 200)
          assert.equal(csv.headers.get("cache-control"), "private, no-store")
          const bytes = Buffer.from(await csv.arrayBuffer())
          assert.deepEqual([...bytes.subarray(0, 3)], [239, 187, 191])
          const texto = bytes.toString()
          assert.ok(texto.includes('"Tecido ""Algodão""; cru"'))
          assert.ok(
            texto.includes(
              '"\'=1+1; ""revisão""\nSegunda linha da observação"',
            ),
          )
          assert.equal((texto.match(/\r\n/g) ?? []).length, 32)
          assert.ok(texto.includes('"0,300"'))
          const pdf = await req(`${rota}/exportar?${filtro}&formato=pdf`)
          assert.equal(pdf.status, 200)
          assert.equal(pdf.headers.get("content-type"), "application/pdf")
          const buffer = Buffer.from(await pdf.arrayBuffer())
          assert.equal(buffer.subarray(0, 5).toString(), "%PDF-")
          assert.ok(
            (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length >
              1,
          )
          const parcial = await req(
            `${rota}/exportar?${filtro}&origemTipo=API_SAIDA&formato=csv`,
          )
          assert.equal(parcial.status, 200)
          assert.equal(((await parcial.text()).match(/\r\n/g) ?? []).length, 2)
        }
        assert.deepEqual(await prisma.estoque.findFirstOrThrow(where), antes)
        assert.equal(
          await prisma.movimentacao_estoque.count(where),
          quantidadeMovimentos,
        )
        assert.equal(await prisma.kardex.count(where), quantidadeKardex)
        const fixtureVolume = Array.from({ length: 501 }, () => ({
          ...ledger,
          id_usuario: usuario.id,
          id_local_estoque: local.id,
          id_setor: setor.id,
          tipo: "AJUSTE_ENTRADA",
          quantidade: "0.300",
        }))
        await prisma.movimentacao_estoque.createMany({ data: fixtureVolume })
        assert.equal(
          (
            await req(
              `/api/estoque/movimentacoes/exportar?${filtro}&formato=pdf`,
            )
          ).status,
          413,
        )
        await prisma.permissoes_usuario.update({
          where: { id: relatorios.id },
          data: { pode_ler: false },
        })
        assert.equal(
          (await req(`/api/estoque/kardex/exportar?${filtro}&formato=csv`))
            .status,
          403,
        )
        assert.equal((await req(`/api/estoque/kardex?${filtro}`)).status, 200)
        await prisma.permissoes_usuario.update({
          where: { id: estoquePerm.id },
          data: { pode_ler: false },
        })
        assert.equal((await movimento("entradas", entrada, chave)).status, 403)
      },
    )
  } finally {
    server?.kill()
    await prisma.$disconnect()
    hooks.deregister()
  }
})
