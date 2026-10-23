import assert from "node:assert/strict"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import mariadb from "mariadb"
import { bancoLocal } from "../tests/helpers/integracao-pedidos.mjs"

// Uso exclusivo em banco local vazio. As migrations antigas não contêm todo
// o contrato integrado de pedidos/financeiro; não são baseline desta entrega.
const BASE = "90b64eea48067c07da8c56387e82f67c8d3c7316"
const MIGRATION = "20261017000000_pedido_contas_receber"
// Somente migrations cujos efeitos pertencem ao snapshot reconstruído abaixo.
// Nunca registrar automaticamente alterações futuras como já aplicadas.
const HISTORICAS = [
  "20260918000000_baseline",
  "20260920000000_refresh_token_rotation",
  "20260922000000_estoque_minimo_local",
  "20261004000000_setores_fluxos_producao",
  "20261013000000_add_status_tipos_produto",
]
const migrations = readdirSync("prisma/migrations")
  .filter((name) =>
    existsSync(path.join("prisma/migrations", name, "migration.sql")),
  )
  .sort()
assert.deepEqual(
  migrations,
  [...HISTORICAS, MIGRATION],
  "Histórico diferente do snapshot conhecido. Revise a base antes de preparar o banco.",
)
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
// O schema Prisma não representa CHECK e ON UPDATE de timestamps. Restaurar
// estes efeitos históricos na base vazia antes de adotar seu histórico.
const complementos = await mariadb.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
})
try {
  for (const statement of [
    "ALTER TABLE estoque_minimo_local MODIFY data_atualizacao TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0)",
    "ALTER TABLE setores MODIFY data_atualizacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    "ALTER TABLE fluxos_producao MODIFY data_atualizacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    "ALTER TABLE fluxo_producao_setor ADD CONSTRAINT chk_fluxo_setor_ordem CHECK (ordem BETWEEN 1 AND 100)",
  ])
    await complementos.query(statement)
} finally {
  await complementos.end()
}
// Adoção apenas desta reconstrução LOCAL e VAZIA que acabamos de criar; não é
// uma ferramenta de reconciliação de bancos existentes/compartilhados.
for (const migration of HISTORICAS)
  prisma(["migrate", "resolve", "--applied", migration])
if (!legado) {
  prisma(["migrate", "deploy"])
  prisma(["migrate", "status"])
}
console.log(
  legado
    ? "Banco local anterior preparado; histórico adotado e migration de recebíveis pendente."
    : "Banco local preparado com a migration de recebíveis aplicada e registrada pelo Prisma.",
)
