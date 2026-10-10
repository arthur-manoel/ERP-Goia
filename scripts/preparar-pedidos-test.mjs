import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import mariadb from "mariadb"
import { bancoLocal } from "../tests/helpers/integracao-pedidos.mjs"

// Snapshot da develop de origem: inclui as estruturas da PR #69, ausentes nas
// migrations antigas. Não é implantação; exclusivamente banco local vazio.
const BASE = "5475b9d1529408e8ab91d8dbbc91ff042223ccc3"
assert.ok(
  process.argv.slice(2).every((v) => v === "--legado"),
  "Argumento desconhecido.",
)
const legado = process.argv.includes("--legado")
const value = legado
  ? process.env.PEDIDOS_UPGRADE_TEST_DATABASE_URL
  : process.env.PEDIDOS_TEST_DATABASE_URL
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
const temp = mkdtempSync(path.resolve(".local/pedidos-preparo-"))
const schema = path.join(temp, "base.prisma"),
  sql = path.join(temp, "base.sql")
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
  if (result.status !== 0)
    throw new Error(
      `Preparação local falhou; preserve o banco para inspeção. ${result.stderr || result.stdout}`,
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
    path.resolve("prisma/ddl/pedidos-itens-variacoes.sql"),
  ])
console.log(
  legado
    ? "Banco local com estrutura anterior preparado para teste de transição."
    : "Banco local vazio preparado com estrutura develop e SQL mínimo de pedidos.",
)
