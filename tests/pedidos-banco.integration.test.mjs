import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import mariadb from "mariadb"
import { bancoLocal } from "./helpers/integracao-pedidos.mjs"

test("DDL DB-first preserva pedidos/itens legados e permissões, em banco local isolado", async (t) => {
  const url = bancoLocal(process.env.PEDIDOS_UPGRADE_TEST_DATABASE_URL)
  const db = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: "+00:00",
  })
  const id = 900001
  let fixtures = false
  try {
    const tables = await db.query("SHOW TABLES")
    for (const row of tables) {
      const table = Object.values(row)[0]
      assert.match(table, /^[a-z_]+$/)
      assert.equal(
        String((await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``))[0].n),
        "0",
        `Banco deve estar vazio: ${table}`,
      )
    }
    assert.equal(
      (await db.query("SHOW COLUMNS FROM pedido_cliente LIKE 'versao'")).length,
      0,
      "Use estrutura develop anterior ao SQL da feature.",
    )
    await db.beginTransaction()
    await db.query(
      "INSERT INTO empresas (id,razao_social,cnpj) VALUES (?, 'Legado isolado', '99000000000001')",
      [id],
    )
    await db.query(
      "INSERT INTO cargos (id,id_empresa,nome) VALUES (?,?,'VENDAS')",
      [id, id],
    )
    await db.query(
      "INSERT INTO usuarios (id,nome,email,senha) VALUES (?, 'Legado', 'legado@pedidos.example.test','fixture-sem-login')",
      [id],
    )
    await db.query(
      "INSERT INTO usuario_empresa (id,id_usuario,id_empresa,id_cargo) VALUES (?,?,?,?)",
      [id, id, id, id],
    )
    await db.query(
      "INSERT INTO permissoes_usuario (id,id_usuario_empresa,recurso,pode_editar) VALUES (?,?,'CLIENTES',1)",
      [id, id],
    )
    await db.query(
      "INSERT INTO clientes (id,id_empresa,nome_razao_social,data_atualizacao) VALUES (?,?,'Cliente legado',CURRENT_TIMESTAMP)",
      [id, id],
    )
    await db.query(
      "INSERT INTO tipos_produto (id,nome) VALUES (?,'Tipo legado isolado')",
      [id],
    )
    await db.query(
      "INSERT INTO produtos (id,id_tipo_produto,nome,codigo,permite_venda) VALUES (?,?,'Produto legado','LEGADO',1)",
      [id, id],
    )
    await db.query(
      "INSERT INTO produto_empresa (id,id_empresa,id_produto) VALUES (?,?,?)",
      [id, id, id],
    )
    await db.query(
      "INSERT INTO pedido_cliente (id,id_empresa,id_cliente,id_usuario,numero,valor_total,valor_subtotal,data_atualizacao,data_previsao_entrega) VALUES (?,?,?,?,'LEG-1',17.00,17.00,CURRENT_TIMESTAMP,'2026-11-15 00:00:00')",
      [id, id, id, id],
    )
    // Duas linhas antigas do mesmo produto sem grade não devem ser apagadas/unidas.
    for (let i = 0; i < 2; i++)
      await db.query(
        "INSERT INTO pedido_cliente_item (id,id_pedido_cliente,numero_item,id_produto,descricao,unidade,quantidade,valor_unitario,valor_total,data_atualizacao) VALUES (?,?,?,?,?,'UN',1.000,?, ?,CURRENT_TIMESTAMP)",
        [
          id + i,
          id,
          i + 1,
          id,
          `Linha histórica ${i}`,
          i === 0 ? "7.00" : "10.00",
          i === 0 ? "7.00" : "10.00",
        ],
      )
    await db.commit()
    fixtures = true
    const antes = JSON.stringify(
      await db.query(
        "SELECT numero,status,valor_total,valor_subtotal,data_previsao_entrega FROM pedido_cliente WHERE id=?",
        [id],
      ),
    )
    const itensAntes = JSON.stringify(
      await db.query(
        "SELECT id,numero_item,id_produto,id_cor,id_tamanho,descricao,quantidade,valor_unitario,valor_total FROM pedido_cliente_item WHERE id_pedido_cliente=? ORDER BY id",
        [id],
      ),
    )
    const statements = readFileSync(
      "prisma/ddl/pedidos-itens-variacoes.sql",
      "utf8",
    )
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
    assert.equal(statements.length, 3)
    for (const statement of statements) await db.query(statement)
    await t.test(
      "cabeçalho, prazo, situação e totais históricos intactos",
      async () =>
        assert.equal(
          JSON.stringify(
            await db.query(
              "SELECT numero,status,valor_total,valor_subtotal,data_previsao_entrega FROM pedido_cliente WHERE id=?",
              [id],
            ),
          ),
          antes,
        ),
    )
    await t.test(
      "linhas históricas intactas, sem inventar variações",
      async () => {
        assert.equal(
          JSON.stringify(
            await db.query(
              "SELECT id,numero_item,id_produto,id_cor,id_tamanho,descricao,quantidade,valor_unitario,valor_total FROM pedido_cliente_item WHERE id_pedido_cliente=? ORDER BY id",
              [id],
            ),
          ),
          itensAntes,
        )
        const novos = await db.query(
          "SELECT id_variacao FROM pedido_cliente_item WHERE id_pedido_cliente=?",
          [id],
        )
        assert.deepEqual(
          novos.map((i) => i.id_variacao),
          [null, null],
        )
      },
    )
    await t.test("versão inicial e idempotência legada nula", async () => {
      const [pedido] = await db.query(
        "SELECT versao,chave_idempotencia,hash_requisicao FROM pedido_cliente WHERE id=?",
        [id],
      )
      assert.equal(pedido.versao, 1)
      assert.equal(pedido.chave_idempotencia, null)
      assert.equal(pedido.hash_requisicao, null)
    })
    await t.test(
      "enum ampliado sem concessão automática ou mudança de permissão",
      async () => {
        const [permissao] = await db.query(
          "SELECT recurso,pode_editar FROM permissoes_usuario WHERE id=?",
          [id],
        )
        assert.equal(permissao.recurso, "CLIENTES")
        assert.equal(permissao.pode_editar, 1)
        assert.equal(
          String(
            (
              await db.query(
                "SELECT COUNT(*) AS n FROM permissoes_usuario WHERE recurso='PEDIDOS'",
              )
            )[0].n,
          ),
          "0",
        )
      },
    )
    await t.test(
      "FK rejeita variação inexistente",
      async () =>
        await assert.rejects(
          db.query(
            "UPDATE pedido_cliente_item SET id_variacao=2147483647 WHERE id=?",
            [id],
          ),
        ),
    )
  } finally {
    await db.rollback()
    if (fixtures) {
      await db.query(
        "DELETE FROM pedido_cliente_item WHERE id_pedido_cliente=?",
        [id],
      )
      await db.query("DELETE FROM pedido_cliente WHERE id=?", [id])
      await db.query("DELETE FROM produto_empresa WHERE id=?", [id])
      await db.query("DELETE FROM produtos WHERE id=?", [id])
      await db.query("DELETE FROM tipos_produto WHERE id=?", [id])
      await db.query("DELETE FROM clientes WHERE id=?", [id])
      await db.query("DELETE FROM permissoes_usuario WHERE id=?", [id])
      await db.query("DELETE FROM usuario_empresa WHERE id=?", [id])
      await db.query("DELETE FROM usuarios WHERE id=?", [id])
      await db.query("DELETE FROM cargos WHERE id=?", [id])
      await db.query("DELETE FROM empresas WHERE id=?", [id])
    }
    await db.end()
  }
})
