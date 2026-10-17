import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import mariadb from "mariadb"
import { bancoLocal } from "../tests/helpers/integracao-pedidos.mjs"

// Uso exclusivo em banco local vazio. As migrations antigas não contêm todo
// o contrato integrado de pedidos/financeiro; não são baseline desta entrega.
const BASE = "90b64eea48067c07da8c56387e82f67c8d3c7316"
assert.ok(
  process.argv.slice(2).every((argumento) => argumento === "--legado"),
  "Argumento desconhecido.",
)
const legado = process.argv.includes("--legado")
const value = legado
  ? process.env.RECEBIVEIS_UPGRADE_TEST_DATABASE_URL
  : process.env.RECEBIVEIS_TEST_DATABASE_URL
const url = bancoLocal(value)
const db = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
})
try {
  assert.equal(
    (await db.query("SHOW TABLES")).length,
    0,
    "Banco já possui tabelas; nada será removido ou sobrescrito.",
  )
} finally {
  await db.end()
}
const git = spawnSync("git", ["show", `${BASE}:prisma/schema.prisma`], {
  encoding: "utf8",
  maxBuffer: 16000000,
  windowsHide: true,
})
assert.equal(git.status, 0, "Commit-base não disponível na cópia oficial.")
mkdirSync(".local", { recursive: true })
const temp = mkdtempSync(path.resolve(".local/pedido-recebiveis-preparo-"))
const schema = path.join(temp, "base.prisma")
const sql = path.join(temp, "base.sql")
writeFileSync(schema, git.stdout, "utf8")
function prisma(args) {
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), ...args],
    {
      env: { ...process.env, DATABASE_URL: value },
      encoding: "utf8",
      maxBuffer: 16000000,
      windowsHide: true,
    },
  )
  assert.equal(
    result.status,
    0,
    "Preparação local falhou. Preserve o banco para inspeção; nada será apagado.",
  )
}
prisma([
  "migrate",
  "diff",
  "--from-empty",
  "--to-schema",
  schema,
  "--script",
  "--output",
  sql,
])
prisma(["db", "execute", "--file", sql])
if (!legado)
  prisma([
    "db",
    "execute",
    "--file",
    path.resolve("prisma/ddl/pedido-recebiveis.sql"),
  ])
console.log(
  legado
    ? "Banco local anterior preparado para teste de atualização de recebíveis."
    : "Banco local vazio preparado com o contrato de pedidos e recebíveis.",
)
