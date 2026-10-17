import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import mariadb from "mariadb"
import { bancoLocal } from "./helpers/integracao-pedidos.mjs"

const HISTORICAS = [
  "20260918000000_baseline",
  "20260920000000_refresh_token_rotation",
  "20260922000000_estoque_minimo_local",
  "20261004000000_setores_fluxos_producao",
  "20261013000000_add_status_tipos_produto",
]
const NOVA = "20261017000000_pedido_contas_receber"
const checksum = (name) =>
  createHash("sha256")
    .update(
      readFileSync(path.resolve("prisma/migrations", name, "migration.sql")),
    )
    .digest("hex")

function aplicarMigration(value) {
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: value },
      encoding: "utf8",
      maxBuffer: 16000000,
      windowsHide: true,
    },
  )
  // Não publica a saída da CLI: erros de conexão podem conter credenciais.
  assert.ok(!result.error, "Não foi possível iniciar o Prisma CLI local.")
  assert.equal(
    result.status,
    0,
    "migrate deploy falhou no banco local. Preserve o banco para inspeção; nada será apagado.",
  )
}

test("migration de recebíveis preserva legado e impõe os novos vínculos no banco local", async (t) => {
  const url = bancoLocal(process.env.RECEBIVEIS_UPGRADE_TEST_DATABASE_URL)
  const db = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: "+00:00",
    dateStrings: true,
  })
  const id = 930001
  let fixtures = false
  const rejeitar = (sql, args, code) =>
    assert.rejects(db.query(sql, args), (error) => error.code === code)
  const migracoes = () =>
    db.query(
      "SELECT id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count FROM _prisma_migrations ORDER BY migration_name,id",
    )
  try {
    for (const row of await db.query("SHOW TABLES")) {
      const table = Object.values(row)[0]
      assert.match(table, /^[a-z_]+$/)
      if (table === "_prisma_migrations") continue
      assert.equal(
        String((await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0].n),
        "0",
        `Banco deve estar vazio: ${table}`,
      )
    }
    assert.equal(
      (await db.query("SHOW COLUMNS FROM contas_receber LIKE 'id_fechamento'"))
        .length,
      0,
      "Prepare o banco anterior com --legado; a nova migration ainda não deve estar aplicada.",
    )
    const historicoAnterior = await migracoes()
    assert.deepEqual(
      historicoAnterior.map((row) => row.migration_name),
      HISTORICAS,
      "A base local deve ter somente as cinco migrations históricas registradas.",
    )
    for (const row of historicoAnterior) {
      assert.notEqual(row.finished_at, null)
      assert.equal(row.rolled_back_at, null)
      assert.ok(row.logs === null || row.logs === "")
      assert.equal(row.checksum, checksum(row.migration_name))
    }
    await db.beginTransaction()
    for (let offset = 0; offset < 2; offset++) {
      await db.query(
        "INSERT INTO empresas (id,razao_social,cnpj) VALUES (?, 'Empresa isolada', ?)",
        [id + offset, `9900000000093${offset}`],
      )
      await db.query(
        "INSERT INTO clientes (id,id_empresa,nome_razao_social,data_atualizacao) VALUES (?,?,'Cliente isolado',CURRENT_TIMESTAMP)",
        [id + offset, id + offset],
      )
      await db.query(
        "INSERT INTO categoria_financeira (id,id_empresa,nome,tipo) VALUES (?,?,'Vendas isoladas','RECEITA')",
        [id + offset, id + offset],
      )
    }
    await db.query(
      "INSERT INTO usuarios (id,nome,email,senha) VALUES (?,'Fixture isolada','upgrade-recebiveis@example.test','sem-login')",
      [id],
    )
    await db.query(
      "INSERT INTO cargos (id,id_empresa,nome) VALUES (?,?,'VENDAS')",
      [id, id],
    )
    await db.query(
      "INSERT INTO usuario_empresa (id,id_usuario,id_empresa,id_cargo) VALUES (?,?,?,?)",
      [id, id, id, id],
    )
    await db.query(
      "INSERT INTO permissoes_usuario (id,id_usuario_empresa,recurso,pode_editar) VALUES (?,?,'PEDIDOS',1)",
      [id, id],
    )
    await db.query(
      "INSERT INTO tipos_produto (id,nome) VALUES (?,'Tipo isolado')",
      [id],
    )
    await db.query(
      "INSERT INTO produtos (id,id_tipo_produto,nome,codigo,permite_venda) VALUES (?,?,'Produto isolado','RECEB-UPGRADE',1)",
      [id, id],
    )
    for (let offset = 0; offset < 2; offset++)
      await db.query(
        "INSERT INTO pedido_cliente (id,id_empresa,id_cliente,id_usuario,numero,status,valor_subtotal,valor_total,data_atualizacao) VALUES (?,?,?,?,'UPGRADE','CONCLUIDO',100,100,CURRENT_TIMESTAMP)",
        [id + offset, id + offset, id + offset, id],
      )
    for (let offset = 0; offset < 2; offset++)
      await db.query(
        "INSERT INTO pedido_cliente_item (id,id_pedido_cliente,numero_item,id_produto,descricao,unidade,quantidade,valor_unitario,valor_total,data_atualizacao) VALUES (?,?,?,?,?,'UN',1,50,50,CURRENT_TIMESTAMP)",
        [id + offset, id, offset + 1, id, `Linha legada ${offset + 1}`],
      )
    await db.query(
      "INSERT INTO venda (id,id_empresa,id_cliente,id_usuario,numero,valor_total,data_atualizacao) VALUES (?,?,?,?,'VENDA-LEGADA',100,CURRENT_TIMESTAMP)",
      [id, id, id, id],
    )
    await db.query(
      "INSERT INTO item_venda (id,id_venda,id_produto,quantidade,valor_unitario,valor_total) VALUES (?,?,?,2,50,100)",
      [id, id, id],
    )
    await db.query(
      "INSERT INTO contas_receber (id,id_empresa,id_venda,id_categoria,data_vencimento,valor_original,valor_final,situacao,data_atualizacao) VALUES (?,?,?,?,'2026-12-10',100,100,'PAGO',CURRENT_TIMESTAMP)",
      [id, id, id, id],
    )
    await db.query(
      "INSERT INTO pagamentos_receber (id,id_empresa,id_conta_receber,valor,forma_pagamento) VALUES (?,?,?,100,'PIX')",
      [id, id, id],
    )
    await db.commit()
    fixtures = true
    const snapshot = async () =>
      JSON.stringify({
        pedidos: await db.query(
          "SELECT id,id_empresa,id_cliente,numero,status,valor_total,versao FROM pedido_cliente ORDER BY id",
        ),
        itens: await db.query(
          "SELECT id,id_pedido_cliente,id_produto,id_variacao,quantidade,valor_unitario,valor_total FROM pedido_cliente_item ORDER BY id",
        ),
        vendas: await db.query(
          "SELECT id,id_empresa,id_cliente,id_pedido_cliente,numero,valor_total FROM venda ORDER BY id",
        ),
        itensVenda: await db.query(
          "SELECT id,id_venda,id_produto,id_pedido_cliente_item,quantidade,valor_total FROM item_venda ORDER BY id",
        ),
        contas: await db.query(
          "SELECT id,id_empresa,id_venda,id_categoria,valor_original,valor_final,data_vencimento,situacao FROM contas_receber ORDER BY id",
        ),
        pagamentos: await db.query(
          "SELECT id,id_empresa,id_conta_receber,valor,forma_pagamento,status FROM pagamentos_receber ORDER BY id",
        ),
        permissoes: await db.query(
          "SELECT id,id_usuario_empresa,recurso,pode_ler,pode_criar,pode_editar,pode_excluir FROM permissoes_usuario ORDER BY id",
        ),
      })
    const antes = await snapshot()
    aplicarMigration(url.toString())

    await t.test(
      "registra a nova migration e preserva o histórico anterior",
      async () => {
        const historicoAtual = await migracoes()
        assert.deepEqual(
          historicoAtual.map((row) => row.migration_name),
          [...HISTORICAS, NOVA],
        )
        assert.deepEqual(
          historicoAtual.filter((row) => row.migration_name !== NOVA),
          historicoAnterior,
        )
        const nova = historicoAtual.find((row) => row.migration_name === NOVA)
        assert.equal(nova.checksum, checksum(NOVA))
        assert.notEqual(nova.finished_at, null)
        assert.equal(nova.rolled_back_at, null)
        assert.ok(nova.logs === null || nova.logs === "")
        assert.equal(nova.applied_steps_count, 1)
      },
    )
    await t.test(
      "segunda execução de deploy não reaplica SQL nem altera dados ou histórico",
      async () => {
        const historicoAntes = await migracoes()
        aplicarMigration(url.toString())
        assert.deepEqual(await migracoes(), historicoAntes)
        assert.equal(await snapshot(), antes)
      },
    )

    await t.test(
      "preserva pedidos, vendas, títulos, pagamentos e permissões legados",
      async () => {
        assert.equal(await snapshot(), antes)
      },
    )
    await t.test(
      "não inventa fechamento/saldo de legados nem concede financeiro",
      async () => {
        assert.deepEqual(
          Array.from(
            await db.query(
              "SELECT id_fechamento,saldo FROM contas_receber WHERE id=?",
              [id],
            ),
            (row) => ({ ...row }),
          ),
          [{ id_fechamento: null, saldo: null }],
        )
        assert.equal(
          String(
            (
              await db.query(
                "SELECT COUNT(*) AS n FROM pedido_cliente_fechamento",
              )
            )[0].n,
          ),
          "0",
        )
        assert.equal(
          String(
            (
              await db.query(
                "SELECT COUNT(*) AS n FROM permissoes_usuario WHERE recurso='FINANCEIRO'",
              )
            )[0].n,
          ),
          "0",
        )
        assert.match(
          (
            await db.query(
              "SHOW COLUMNS FROM permissoes_usuario LIKE 'recurso'",
            )
          )[0].Type,
          /'FINANCEIRO'/,
        )
      },
    )
    await t.test(
      "mantém a unicidade avulsa inclusive com pedido_item NULL",
      async () => {
        await rejeitar(
          "INSERT INTO item_venda (id,id_venda,id_produto,quantidade,valor_unitario,valor_total) VALUES (?,?,?,1,50,50)",
          [id + 10, id, id],
          "ER_DUP_ENTRY",
        )
        assert.equal(
          (
            await db.query(
              "SELECT id_produto_sem_pedido FROM item_venda WHERE id=?",
              [id],
            )
          )[0].id_produto_sem_pedido,
          id,
        )
      },
    )
    for (let offset = 10; offset < 12; offset++)
      await db.query(
        "INSERT INTO venda (id,id_empresa,id_cliente,id_usuario,id_pedido_cliente,numero,valor_subtotal,valor_total,data_atualizacao) VALUES (?,?,?,?,?,?,100,100,CURRENT_TIMESTAMP)",
        [id + offset, id, id, id, id, `VENDA-FECHAMENTO-${offset}`],
      )
    await t.test(
      "permite duas linhas reais do mesmo produto, sem repetir a mesma linha",
      async () => {
        for (let offset = 0; offset < 2; offset++)
          await db.query(
            "INSERT INTO item_venda (id,id_venda,id_produto,id_pedido_cliente_item,quantidade,valor_unitario,valor_total) VALUES (?,?,?,?,1,50,50)",
            [id + 10 + offset, id + 10, id, id + offset],
          )
        await rejeitar(
          "INSERT INTO item_venda (id,id_venda,id_produto,id_pedido_cliente_item,quantidade,valor_unitario,valor_total) VALUES (?,?,?,?,1,50,50)",
          [id + 12, id + 10, id, id],
          "ER_DUP_ENTRY",
        )
      },
    )
    const insertFechamento =
      "INSERT INTO pedido_cliente_fechamento (id,id_empresa,id_pedido_cliente,id_cliente,id_venda,id_categoria,id_usuario,valor_total,total_parcelas,plano_pagamento,hash_plano,hash_pedido,snapshot_pedido) VALUES (?,?,?,?,?,?,?,100,2,?,?,?,?)"
    const extra = [
      JSON.stringify({ vencimentos: ["2026-11-10", "2026-12-10"] }),
      "a".repeat(64),
      "b".repeat(64),
      JSON.stringify({ total: "100.00" }),
    ]
    await t.test(
      "FK composta rejeita pedido, cliente e categoria de outra empresa",
      async () => {
        for (const values of [
          [id, id, id + 1, id, id + 10, id, id],
          [id, id, id, id + 1, id + 10, id, id],
          [id, id, id, id, id + 10, id + 1, id],
        ])
          await rejeitar(
            insertFechamento,
            [...values, ...extra],
            "ER_NO_REFERENCED_ROW_2",
          )
      },
    )
    await db.query(insertFechamento, [
      id,
      id,
      id,
      id,
      id + 10,
      id,
      id,
      ...extra,
    ])
    await t.test("um único fechamento por pedido e por venda", async () => {
      await rejeitar(
        insertFechamento,
        [id + 1, id, id, id, id + 11, id, id, ...extra],
        "ER_DUP_ENTRY",
      )
    })
    const insertConta =
      "INSERT INTO contas_receber (id,id_empresa,id_venda,id_categoria,id_fechamento,numero_parcela,total_parcelas,data_vencimento,valor_original,valor_final,saldo,data_atualizacao) VALUES (?,?,?,?,?,?,2,?,50,50,?,CURRENT_TIMESTAMP)"
    await t.test(
      "títulos persistem saldo inicial, data civil e identidade única de parcela",
      async () => {
        for (let offset = 0; offset < 2; offset++)
          await db.query(insertConta, [
            id + 20 + offset,
            id,
            id + 10,
            id,
            id,
            offset + 1,
            offset ? "2026-12-10" : "2026-11-10",
            "50.00",
          ])
        const parcelas = await db.query(
          "SELECT numero_parcela,valor_original,saldo,situacao,data_vencimento FROM contas_receber WHERE id_fechamento=? ORDER BY numero_parcela",
          [id],
        )
        assert.deepEqual(
          parcelas.map((row) => [
            row.numero_parcela,
            row.valor_original,
            row.saldo,
            row.situacao,
            row.data_vencimento,
          ]),
          [
            [1, "50.00", "50.00", "ABERTO", "2026-11-10"],
            [2, "50.00", "50.00", "ABERTO", "2026-12-10"],
          ],
        )
        await rejeitar(
          insertConta,
          [id + 22, id, id + 10, id, id, 1, "2026-11-10", "50.00"],
          "ER_DUP_ENTRY",
        )
      },
    )
    await t.test(
      "FK do título exige a mesma empresa, venda e categoria do fechamento",
      async () => {
        for (const values of [
          [id + 22, id + 1, id + 10, id],
          [id + 22, id, id + 11, id],
          [id + 22, id, id + 10, id + 1],
        ])
          await rejeitar(
            insertConta,
            [...values, id, 3, "2027-01-10", "50.00"],
            "ER_NO_REFERENCED_ROW_2",
          )
      },
    )
    await t.test(
      "CHECK rejeita saldo ausente/negativo/excessivo somente em títulos novos",
      async () => {
        for (const saldo of [null, "-0.01", "50.01"])
          await assert.rejects(
            db.query("UPDATE contas_receber SET saldo=? WHERE id=?", [
              saldo,
              id + 20,
            ]),
          )
      },
    )
    await t.test(
      "histórico financeiro impede apagar pedido, venda e fechamento",
      async () => {
        for (const table of [
          "pedido_cliente",
          "venda",
          "pedido_cliente_fechamento",
        ])
          await assert.rejects(
            db.query(`DELETE FROM ${table} WHERE id=?`, [
              table === "venda" ? id + 10 : id,
            ]),
          )
      },
    )
  } finally {
    await db.rollback()
    if (fixtures) {
      const existentes = new Set(
        (await db.query("SHOW TABLES")).map((row) => Object.values(row)[0]),
      )
      for (const [table, ids] of [
        ["pagamentos_receber", [id]],
        ["contas_receber", [id, id + 20, id + 21]],
        ["pedido_cliente_fechamento", [id]],
        ["item_venda", [id, id + 10, id + 11]],
        ["venda", [id, id + 10, id + 11]],
        ["pedido_cliente_item", [id, id + 1]],
        ["pedido_cliente", [id, id + 1]],
        ["produtos", [id]],
        ["tipos_produto", [id]],
        ["categoria_financeira", [id, id + 1]],
        ["clientes", [id, id + 1]],
        ["permissoes_usuario", [id]],
        ["usuario_empresa", [id]],
        ["cargos", [id]],
        ["usuarios", [id]],
        ["empresas", [id, id + 1]],
      ])
        if (existentes.has(table))
          await db.query(
            `DELETE FROM ${table} WHERE id IN (${ids.map(() => "?").join(",")})`,
            ids,
          )
    }
    await db.end()
  }
})
