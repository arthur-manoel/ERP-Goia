import assert from "node:assert/strict"
import { test } from "node:test"
import { registerHooks } from "node:module"
import mariadb from "mariadb"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"

test("plano da compra em MySQL local", async (t) => {
  const url = bancoLocal(process.env.PLANO_COMPRA_TEST_DATABASE_URL)
  process.env.DATABASE_URL = url.href
  const hooks = typescript()
  const next = registerHooks({
    resolve(specifier, context, resolve) {
      return resolve(
        specifier === "next/server" ? "next/server.js" : specifier,
        context,
      )
    },
  })
  const { prisma } = await import("../src/lib/prisma.ts")
  const { criarCompra, confirmarCompra, preverPlanoCompra, acaoCompra } =
    await import("../src/modules/compras/compras.service.ts")
  const { createContaPagar, deleteContaPagar, listContasPagar } =
    await import("../modules/contas_pagar/service.ts")
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
      "Use um banco dedicado vazio.",
    )
    const empresa = await prisma.empresas.create({
      data: { razao_social: "Teste compras", cnpj: "99000000000011" },
    })
    const outra = await prisma.empresas.create({
      data: { razao_social: "Outra", cnpj: "99000000000022" },
    })
    const usuario = await prisma.usuarios.create({
      data: { nome: "Teste", email: "plano@example.test", senha: "fixture" },
    })
    const id_empresa = empresa.id
    const cargo = await prisma.cargos.create({
      data: { id_empresa, nome: "Operador" },
    })
    await prisma.usuario_empresa.create({
      data: {
        id_empresa,
        id_cargo: cargo.id,
        id_usuario: usuario.id,
        nivel_acesso: "EMPRESA",
      },
    })
    const ctx = {
      idEmpresa: empresa.id,
      idUsuario: usuario.id,
      pode: { ler: true, criar: true, editar: true, excluir: true },
    }
    const local = await prisma.locais_estoque.create({
      data: { id_empresa, nome: "Local" },
    })
    const fornecedor = await prisma.fornecedores.create({
      data: { id_empresa, razao_social: "Fornecedor" },
    })
    const categoria = await prisma.categoria_financeira.create({
      data: { id_empresa, nome: "Compras", tipo: "DESPESA" },
    })
    const categoriaAlheia = await prisma.categoria_financeira.create({
      data: { id_empresa: outra.id, nome: "Compras", tipo: "DESPESA" },
    })
    const tipo = await prisma.tipos_produto.create({ data: { nome: "Insumo" } })
    const produto = await prisma.produtos.create({
      data: {
        id_tipo_produto: tipo.id,
        nome: "Insumo",
        codigo: "IN-1",
        permite_compra: true,
      },
    })
    await prisma.produto_empresa.create({
      data: { id_empresa, id_produto: produto.id },
    })
    const compraInput = {
      rascunho: true,
      idFornecedor: fornecedor.id,
      idLocalEstoque: local.id,
      itens: [
        { idProduto: produto.id, quantidade: "1", valorUnitario: "100.00" },
      ],
    }
    const criar = async (input = compraInput) =>
      (await criarCompra(ctx, input)).compra.id
    const plano = {
      idCategoria: categoria.id,
      vencimentos: ["2026-12-05", "2027-01-05", "2027-02-05"],
    }
    const titulos = (id_compra) =>
      prisma.contas_pagar.findMany({
        where: { id_compra },
        orderBy: { numero_parcela: "asc" },
      })

    await t.test(
      "criação repetida, confirmação simultânea e proteção das parcelas",
      async () => {
        const input = { ...compraInput, chaveIdempotencia: "teste-plano-1" }
        const [id, repetido] = await Promise.all([criar(input), criar(input)])
        assert.equal(repetido, id)
        await assert.rejects(
          preverPlanoCompra({ ...ctx, idEmpresa: outra.id }, id, plano),
          { status: 404 },
        )
        await assert.rejects(
          preverPlanoCompra(ctx, id, {
            ...plano,
            idCategoria: categoriaAlheia.id,
          }),
          { status: 400 },
        )
        const previa = await preverPlanoCompra(ctx, id, plano)
        assert.equal(previa.plano.valorTotal, "100.00")
        assert.deepEqual(await titulos(id), [])
        const [primeiro, segundo] = await Promise.all([
          confirmarCompra(ctx, id, plano),
          confirmarCompra(ctx, id, plano),
        ])
        assert.deepEqual(primeiro, segundo)
        await assert.rejects(
          confirmarCompra(ctx, id, {
            ...plano,
            vencimentos: plano.vencimentos.slice(1),
          }),
          { status: 409 },
        )
        const contas = await titulos(id)
        assert.deepEqual(
          contas.map((c) => c.valor_final.toFixed(2)),
          ["33.33", "33.33", "33.34"],
        )
        assert.deepEqual(
          contas.map((c) => c.data_vencimento.toISOString().slice(0, 10)),
          plano.vencimentos,
        )
        assert.equal(
          await prisma.planos_pagamento_compra.count({
            where: { id_compra: id },
          }),
          1,
        )
        await assert.rejects(
          deleteContaPagar(String(contas[0].id), [id_empresa], ctx),
          { status: 409 },
        )
        const lista = await listContasPagar(
          {
            id_plano_pagamento: String(contas[0].id_plano_pagamento),
            limit: "1",
          },
          [id_empresa],
        )
        assert.equal(lista.count, 3)
        assert.equal(lista.rows.length, 1)
        assert.equal(lista.plano.id, contas[0].id_plano_pagamento)
        await assert.rejects(
          listContasPagar(
            { id_plano_pagamento: String(contas[0].id_plano_pagamento) },
            [outra.id],
          ),
          { status: 404 },
        )
        await acaoCompra(ctx, id, "cancelar")
        assert.ok((await titulos(id)).every((c) => c.situacao === "CANCELADO"))
        assert.equal(
          (await prisma.compras.findUniqueOrThrow({ where: { id } })).status,
          "CANCELADA",
        )
      },
    )

    await t.test(
      "títulos legados impedem geração e pagamentos impedem cancelamento",
      async () => {
        const legado = await criar({ ...compraInput, rascunho: false })
        await createContaPagar(
          {
            id_empresa,
            id_compra: legado,
            id_categoria: categoria.id,
            data_vencimento: plano.vencimentos[0],
            valor_original: "100.00",
          },
          [id_empresa],
          ctx,
        )
        await assert.rejects(confirmarCompra(ctx, legado, plano), {
          status: 409,
        })

        const id = await criar()
        await confirmarCompra(ctx, id, plano)
        const [conta] = await titulos(id)
        await prisma.pagamentos_pagar.create({
          data: {
            id_empresa,
            id_conta_pagar: conta.id,
            valor: "1.00",
            forma_pagamento: "PIX",
          },
        })
        await assert.rejects(acaoCompra(ctx, id, "cancelar"), { status: 409 })
        assert.ok((await titulos(id)).every((c) => c.situacao === "ABERTO"))
      },
    )

    await t.test(
      "cancelamento concorrente aguarda o pagamento e preserva o plano",
      async () => {
        const id = await criar()
        await confirmarCompra(ctx, id, plano)
        const [conta] = await titulos(id)
        const bloqueada = Promise.withResolvers()
        const finalizar = Promise.withResolvers()
        const pagamento = prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${id_empresa} FOR UPDATE`
          await tx.$queryRaw`SELECT id FROM contas_pagar WHERE id = ${conta.id} FOR UPDATE`
          await tx.pagamentos_pagar.create({
            data: {
              id_empresa,
              id_conta_pagar: conta.id,
              valor: conta.valor_final,
              forma_pagamento: "PIX",
            },
          })
          await tx.contas_pagar.update({
            where: { id: conta.id },
            data: { situacao: "PAGO" },
          })
          bloqueada.resolve()
          await finalizar.promise
        })
        await Promise.race([bloqueada.promise, pagamento])
        const cancelamento = assert.rejects(acaoCompra(ctx, id, "cancelar"), {
          status: 409,
        })
        finalizar.resolve()
        await Promise.all([pagamento, cancelamento])
        assert.equal((await titulos(id))[0].situacao, "PAGO")
        assert.equal(
          (await prisma.compras.findUniqueOrThrow({ where: { id } })).status,
          "EMITIDA",
        )
      },
    )

    for (const [tabela, evento] of [
      ["planos_pagamento_compra", "INSERT"],
      ["contas_pagar", "INSERT"],
      ["compras", "UPDATE"],
      ["auditoria", "INSERT"],
    ]) {
      await t.test(
        `falha em ${tabela} reverte a confirmação inteira`,
        async () => {
          const id = await criar()
          // Comandos fixos em banco de teste. A falha é provocada no MySQL real.
          await sql.query(
            `CREATE TRIGGER teste_falha_plano BEFORE ${evento} ON ${tabela} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha de teste'`,
          )
          try {
            await assert.rejects(confirmarCompra(ctx, id, plano))
            assert.deepEqual(await titulos(id), [])
            assert.equal(
              await prisma.planos_pagamento_compra.count({
                where: { id_compra: id },
              }),
              0,
            )
            assert.equal(
              (await prisma.compras.findUniqueOrThrow({ where: { id } }))
                .status,
              "RASCUNHO",
            )
          } finally {
            await sql.query("DROP TRIGGER teste_falha_plano")
          }
        },
      )
    }
  } finally {
    await sql.end()
    await prisma.$disconnect()
    next.deregister()
    hooks.deregister()
  }
})
