import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import mariadb from "mariadb"
import { bancoLocal } from "../tests/helpers/integracao-pedidos.mjs"

const url = bancoLocal(process.env.PERMISSOES_PERDAS_TEST_DATABASE_URL)
const database = url.pathname.slice(1)
const connection = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  multipleStatements: true,
})
try {
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await connection.query(`USE \`${database}\``)
  const tables = await connection.query("SHOW TABLES")
  assert.equal(
    tables.length,
    0,
    "Use outro banco local vazio; não apaga nem altera uma base existente.",
  )
  const base = "cba9097b36b45fe742c1f118a0c1333b4295ecdf"
  const schema = execFileSync("git", ["show", `${base}:prisma/schema.prisma`], {
    encoding: "utf8",
  })
  const temp = path.resolve(".local/permissoes-perdas-base.prisma")
  mkdirSync(path.dirname(temp), { recursive: true })
  writeFileSync(temp, schema)
  let sql = execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      temp,
      "--script",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: url.href },
      maxBuffer: 4 * 1024 * 1024,
    },
  )
  // O Prisma não representa os CHECKs: usar o SQL canônico real desta tabela.
  sql = sql
    .replace(/CREATE TABLE `ordem_producao_apontamento`[\s\S]*?;\s*/g, "")
    .replace(/ALTER TABLE `ordem_producao_apontamento`[\s\S]*?;\s*/g, "")
  // MariaDB rejeita CASCADE sobre id_empresa NOT NULL referenciando o
  // id_empresa nullable destes catálogos. Restrição MAIS forte só no baseline
  // sintético de teste; não modifica migrations históricas nem outro ambiente.
  sql = sql.replace(
    /(ALTER TABLE `item_venda` ADD CONSTRAINT `fk_item_venda_(?:cor|tamanho)`[^;]*ON UPDATE )CASCADE/g,
    "$1RESTRICT",
  )
  for (const statement of sql
    .split(/;\s*(?:\r?\n|$)/)
    .filter((value) => value.trim())) {
    try {
      await connection.query(statement)
    } catch (error) {
      console.error("Falha no baseline:", statement)
      throw error
    }
  }
  const original = readFileSync(
    "prisma/migrations/20261023000000_apontamentos_perdas_producao/migration.sql",
    "utf8",
  )
  const indices = await connection.query(
    "SHOW INDEX FROM ordem_producao_item WHERE Key_name = 'uk_op_item_ordem_id'",
  )
  assert.equal(indices.length, 2)
  await connection.query(original.slice(original.indexOf("CREATE TABLE")))
  const permissoes = await connection.query(
    "SHOW CREATE TABLE permissoes_usuario",
  )
  assert.ok(
    Object.values(permissoes[0]).some((value) =>
      String(value).includes("TIPOS_PRODUTO"),
    ),
  )
  for (const table of [
    "permissoes_usuario",
    "ordem_producao_apontamento",
    "ordem_producao",
    "ordem_producao_fluxo_setor",
    "ordem_producao_item",
  ]) {
    const rows = await connection.query(`SHOW CREATE TABLE \`${table}\``)
    writeFileSync(
      path.resolve(`.local/show-create-${table}-antes.sql`),
      String(Object.values(rows[0])[1]),
    )
  }
  await connection.query(
    readFileSync(
      "prisma/migrations/20261031000000_eventos_apontamentos_producao/migration.sql",
      "utf8",
    ),
  )
  console.log(
    "Banco local dedicado preparado; SQL original e extensão aplicados. Nenhuma concessão criada.",
  )
} finally {
  await connection.end()
}
