// PERDAS_TEST_DATABASE_URL deve apontar para um banco LOCAL já preparado.
// Não executa DDL. Fixtures e apontamentos são revertidos ao terminar.
import assert from "node:assert/strict"
import mariadb from "mariadb"

async function main() {
  const url = new URL(process.env.PERDAS_TEST_DATABASE_URL)
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  const db = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    allowPublicKeyRetrieval: true,
  })
  let checks = 0
  try {
    await db.beginTransaction()
    const suffix = Date.now().toString()
    const insert = async (sql, args = []) =>
      Number((await db.query(sql, args)).insertId)
    const empresa = await insert(
      "INSERT INTO empresas (razao_social, cnpj) VALUES (?, ?)",
      ["Teste perdas", suffix],
    )
    const usuario = await insert(
      "INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)",
      ["Teste perdas", `perdas-${suffix}@example.invalid`, "fixture"],
    )
    const tipo = await insert("INSERT INTO tipos_produto (nome) VALUES (?)", [
      `Perdas ${suffix}`,
    ])
    const produto = await insert(
      "INSERT INTO produtos (id_tipo_produto, nome, codigo) VALUES (?, ?, ?)",
      [tipo, "Teste perdas", suffix],
    )
    const setor = await insert(
      "INSERT INTO setores (id_empresa, nome) VALUES (?, ?)",
      [empresa, "Corte"],
    )
    const outroSetor = await insert(
      "INSERT INTO setores (id_empresa, nome) VALUES (?, ?)",
      [empresa, "Costura"],
    )
    const ordem = await insert(
      "INSERT INTO ordem_producao (id_empresa, id_usuario, numero) VALUES (?, ?, ?)",
      [empresa, usuario, suffix],
    )
    const outraOrdem = await insert(
      "INSERT INTO ordem_producao (id_empresa, id_usuario, numero) VALUES (?, ?, ?)",
      [empresa, usuario, suffix + "-2"],
    )
    const item = await insert(
      "INSERT INTO ordem_producao_item (id_ordem_producao, id_produto, tamanho, quantidade) VALUES (?, ?, ?, ?)",
      [ordem, produto, "M", "10.000"],
    )
    const outroItem = await insert(
      "INSERT INTO ordem_producao_item (id_ordem_producao, id_produto, tamanho, quantidade) VALUES (?, ?, ?, ?)",
      [outraOrdem, produto, "M", "10.000"],
    )
    await db.query(
      "INSERT INTO ordem_producao_fluxo_setor (id_ordem_producao, id_setor, ordem) VALUES (?, ?, 1), (?, ?, 2), (?, ?, 1)",
      [ordem, setor, ordem, outroSetor, outraOrdem, setor],
    )
    const write = (produzida, perdida, motivo, overrides = {}) => {
      const ids = { ordem, item, setor, usuario, ...overrides }
      return db.query(
        "INSERT INTO ordem_producao_apontamento (id_ordem_producao, id_ordem_producao_item, id_setor, id_usuario, data_apontamento, quantidade_produzida, quantidade_perdida, motivo_perda) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          ids.ordem,
          ids.item,
          ids.setor,
          ids.usuario,
          "2026-10-23",
          produzida,
          perdida,
          motivo,
        ],
      )
    }
    const reject = async (operation, errno) => {
      await assert.rejects(operation, (e) => e.errno === errno)
      checks++
    }
    await write("8.125", "1.125", "Defeito no corte")
    await write("0.000", "0.750", "Perda integral")
    await write("0.500", "0.000", null)
    await write("7.000", "1.000", "Falha na costura", { setor: outroSetor })
    checks += 4
    for (const args of [
      ["-1", "1", "Motivo"],
      ["1", "-1", "Motivo"],
      ["0", "0", null],
      ["1", "1", null],
      ["1", "1", ""],
      ["1", "1", "   "],
      ["1", "0", "Sem perda"],
    ]) {
      await reject(() => write(...args), 3819)
    }
    await reject(() => write("1", "0", null, { item: outroItem }), 1452)
    await reject(() => write("1", "0", null, { setor: -1 }), 1452)
    await reject(() => write("1", "0", null, { usuario: -1 }), 1452)
    await reject(
      () => db.query("DELETE FROM ordem_producao_item WHERE id = ?", [item]),
      1451,
    )
    await reject(
      () =>
        db.query(
          "DELETE FROM ordem_producao_fluxo_setor WHERE id_ordem_producao = ? AND id_setor = ?",
          [ordem, setor],
        ),
      1451,
    )
    await reject(
      () => db.query("DELETE FROM ordem_producao WHERE id = ?", [ordem]),
      1451,
    )
    const totals = await db.query(
      "SELECT id_setor, SUM(quantidade_produzida) produzido, SUM(quantidade_perdida) perdido FROM ordem_producao_apontamento WHERE id_ordem_producao = ? GROUP BY id_setor ORDER BY id_setor",
      [ordem],
    )
    assert.deepEqual(
      totals.map((r) => [r.id_setor, r.produzido, r.perdido]),
      [
        [setor, "8.625", "1.875"],
        [outroSetor, "7.000", "1.000"],
      ],
    )
    assert.equal(
      (
        await db.query(
          "SELECT quantidade_produzida FROM ordem_producao_item WHERE id = ?",
          [item],
        )
      )[0].quantidade_produzida,
      "0.000",
    )
    checks += 2
    console.log(
      `${checks} verificações passaram: perdas, motivos, precisão, etapas, FKs e preservação dos acumuladores.`,
    )
  } finally {
    await db.rollback()
    await db.end()
  }
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
