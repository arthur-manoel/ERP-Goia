import assert from "node:assert/strict"
import { test } from "node:test"
import { bancoLocal, typescript } from "./helpers/integracao-pedidos.mjs"

// Preparar um MySQL local com o schema atual. Este teste não altera a estrutura.
// SEQUENCIAS_TEST_DATABASE_URL=mysql://.../sequencias_test node --test --test-force-exit tests/sequencias-banco.integration.test.mjs
// Ausência de banco é falha, nunca skip ou aprovação de concorrência.
test("sequências transacionais em MySQL local", async (t) => {
  const url = bancoLocal(process.env.SEQUENCIAS_TEST_DATABASE_URL)
  process.env.DATABASE_URL = url.href
  const hooks = typescript()
  const { prisma } = await import("../src/lib/prisma.ts")
  const { proximoNumero } = await import("../src/lib/sequencias.ts")
  const pedidos = await import("../src/modules/pedidos/pedidos.repository.ts")
  const producao =
    await import("../src/modules/producao/producao.repository.ts")
  const compras = await import("../src/modules/compras/compras.repository.ts")
  const empresas = []
  let usuario
  const transacao = (operation, isolationLevel = "ReadCommitted") =>
    prisma.$transaction(operation, {
      isolationLevel,
      maxWait: 30000,
      timeout: 30000,
    })
  try {
    for (let i = 0; i < 2; i++)
      empresas.push(
        await prisma.empresas.create({
          data: {
            razao_social: `Sequências isoladas ${i}`,
            cnpj: `${Date.now()}${i}`,
          },
        }),
      )
    usuario = await prisma.usuarios.create({
      data: {
        nome: "Fixture sequências",
        email: `sequencias-${Date.now()}@example.test`,
        senha: "fixture-sem-login",
      },
    })
    const ctx = { idEmpresa: empresas[0].id }
    const chave = (entidade, contexto = ctx) => ({
      id_empresa_entidade: { id_empresa: contexto.idEmpresa, entidade },
    })
    const gerar = (entidade, contexto = ctx) =>
      transacao((tx) => proximoNumero(tx, entidade, contexto))

    await t.test(
      "primeira chamada cria sequência e chamadas sequenciais incrementam",
      async () => {
        assert.equal(
          await prisma.sequencias_automaticas.findUnique({
            where: chave("compras"),
          }),
          null,
        )
        assert.equal(await gerar("compras"), "CP-000001")
        assert.equal(await gerar("compras"), "CP-000002")
        assert.equal(
          (
            await prisma.sequencias_automaticas.findUniqueOrThrow({
              where: chave("compras"),
            })
          ).ultimo_numero,
          2n,
        )
      },
    )

    await t.test(
      "empresas e entidades mantêm contadores independentes",
      async () => {
        assert.equal(
          await gerar("compras", { idEmpresa: empresas[1].id }),
          "CP-000001",
        )
        assert.equal(await gerar("requisicao_compra"), "SC-000001")
        assert.equal(await gerar("pedido_compra"), "PC-000001")
        assert.equal(await gerar("compras"), "CP-000003")
      },
    )

    await t.test(
      "primeira criação concorrente em conexões e transações reais",
      async () => {
        const numeros = await Promise.all(
          Array.from({ length: 20 }, () => gerar("nota_fiscal")),
        )
        assert.equal(new Set(numeros).size, 20)
        assert.deepEqual(
          numeros.map(BigInt).sort((a, b) => (a < b ? -1 : 1)),
          Array.from({ length: 20 }, (_, i) => BigInt(i + 1)),
        )
        assert.equal(
          (
            await prisma.sequencias_automaticas.findUniqueOrThrow({
              where: chave("nota_fiscal"),
            })
          ).ultimo_numero,
          20n,
        )
      },
    )

    await t.test(
      "concorrência sobre contador existente em Serializable",
      async () => {
        const numeros = await Promise.all(
          Array.from({ length: 15 }, () =>
            transacao(
              (tx) => proximoNumero(tx, "nota_fiscal", ctx),
              "Serializable",
            ),
          ),
        )
        assert.equal(new Set(numeros).size, 15)
        assert.equal(
          (
            await prisma.sequencias_automaticas.findUniqueOrThrow({
              where: chave("nota_fiscal"),
            })
          ).ultimo_numero,
          35n,
        )
      },
    )

    await t.test(
      "releitura bloqueante desconsidera snapshot antigo em RepeatableRead",
      async () => {
        const snapshot = Promise.withResolvers()
        const gravado = Promise.withResolvers()
        const antiga = transacao(async (tx) => {
          const antes = await tx.sequencias_automaticas.findUniqueOrThrow({
            where: chave("nota_fiscal"),
          })
          snapshot.resolve()
          await gravado.promise
          const depois = await proximoNumero(tx, "nota_fiscal", ctx)
          assert.equal(BigInt(depois), antes.ultimo_numero + 2n)
        }, "RepeatableRead")
        await snapshot.promise
        try {
          await gerar("nota_fiscal")
        } finally {
          gravado.resolve()
        }
        await antiga
      },
    )

    await t.test(
      "geração e criação de ordens simultâneas compartilham a transação",
      async () => {
        const numeros = await Promise.all(
          Array.from({ length: 15 }, () =>
            transacao(async (tx) => {
              const numero = await producao.proximoNumero(tx, ctx.idEmpresa)
              await tx.ordem_producao.create({
                data: {
                  id_empresa: ctx.idEmpresa,
                  id_usuario: usuario.id,
                  numero,
                },
              })
              return numero
            }),
          ),
        )
        assert.equal(new Set(numeros).size, 15)
        assert.equal(
          await prisma.ordem_producao.count({
            where: { id_empresa: ctx.idEmpresa },
          }),
          15,
        )
      },
    )

    await t.test(
      "rollback desfaz incremento e documento relacionado",
      async () => {
        const antes = await prisma.sequencias_automaticas.findUniqueOrThrow({
          where: chave("ordem_producao"),
        })
        let numero
        await assert.rejects(
          transacao(async (tx) => {
            numero = await producao.proximoNumero(tx, ctx.idEmpresa)
            await tx.ordem_producao.create({
              data: {
                id_empresa: ctx.idEmpresa,
                id_usuario: usuario.id,
                numero,
              },
            })
            throw new Error("rollback intencional")
          }),
          /rollback intencional/,
        )
        assert.equal(
          (
            await prisma.sequencias_automaticas.findUniqueOrThrow({
              where: chave("ordem_producao"),
            })
          ).ultimo_numero,
          antes.ultimo_numero,
        )
        assert.equal(
          await prisma.ordem_producao.count({
            where: { id_empresa: ctx.idEmpresa, numero },
          }),
          0,
        )
        assert.equal(await gerar("ordem_producao"), numero)
      },
    )

    await t.test(
      "rollback da primeira geração também remove a linha nova",
      async () => {
        const contexto = { idEmpresa: empresas[1].id }
        await assert.rejects(
          transacao(async (tx) => {
            assert.equal(
              await proximoNumero(tx, "ordem_producao", contexto),
              "1",
            )
            throw new Error("primeira geração desfeita")
          }),
          /primeira geração desfeita/,
        )
        assert.equal(
          await prisma.sequencias_automaticas.findUnique({
            where: chave("ordem_producao", contexto),
          }),
          null,
        )
        assert.equal(await gerar("ordem_producao", contexto), "1")
      },
    )

    await t.test(
      "pedidos preservam dados legados e reutilizam o serviço central",
      async () => {
        const cliente = await prisma.clientes.create({
          data: {
            id_empresa: ctx.idEmpresa,
            nome_razao_social: "Cliente sequências",
          },
        })
        await prisma.pedido_cliente.create({
          data: {
            id_empresa: ctx.idEmpresa,
            id_usuario: usuario.id,
            id_cliente: cliente.id,
            numero: "9007199254740993",
          },
        })
        await prisma.pedido_cliente.create({
          data: {
            id_empresa: ctx.idEmpresa,
            id_usuario: usuario.id,
            id_cliente: cliente.id,
            numero: "PED-MANUAL",
          },
        })
        const numero = await transacao(async (tx) => {
          const numero = await pedidos.proximoNumero(tx, ctx.idEmpresa)
          await tx.pedido_cliente.create({
            data: {
              id_empresa: ctx.idEmpresa,
              id_usuario: usuario.id,
              id_cliente: cliente.id,
              numero,
            },
          })
          return numero
        })
        assert.equal(numero, "9007199254740994")
        assert.equal(
          await transacao((tx) =>
            pedidos.proximoNumero(tx, ctx.idEmpresa, "venda"),
          ),
          "1",
        )
      },
    )

    await t.test(
      "compras conservam seus formatos pelo wrapper existente",
      async () => {
        assert.equal(
          await transacao((tx) =>
            compras.proximoNumero(tx, ctx.idEmpresa, "compras"),
          ),
          "CP-000004",
        )
      },
    )

    await t.test(
      "BigInt mantém precisão e o esgotamento é revertido",
      async () => {
        await prisma.sequencias_automaticas.update({
          where: chave("nota_fiscal"),
          data: { ultimo_numero: 18446744073709551614n },
        })
        assert.equal(await gerar("nota_fiscal"), "18446744073709551615")
        await assert.rejects(gerar("nota_fiscal"), { status: 409 })
        assert.equal(
          (
            await prisma.sequencias_automaticas.findUniqueOrThrow({
              where: chave("nota_fiscal"),
            })
          ).ultimo_numero,
          18446744073709551615n,
        )
      },
    )
  } finally {
    const ids = empresas.map((e) => e.id)
    if (ids.length) {
      await prisma.pedido_cliente.deleteMany({
        where: { id_empresa: { in: ids } },
      })
      await prisma.ordem_producao.deleteMany({
        where: { id_empresa: { in: ids } },
      })
      await prisma.clientes.deleteMany({ where: { id_empresa: { in: ids } } })
      await prisma.sequencias_automaticas.deleteMany({
        where: { id_empresa: { in: ids } },
      })
      await prisma.empresas.deleteMany({ where: { id: { in: ids } } })
    }
    if (usuario) await prisma.usuarios.delete({ where: { id: usuario.id } })
    await prisma.$disconnect()
    hooks.deregister()
  }
})
