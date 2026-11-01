import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import mariadb from "mariadb"
import { bancoLocal } from "../tests/helpers/integracao-pedidos.mjs"

// Reconstrução exclusiva de banco LOCAL VAZIO, sem assumir que o histórico
// incompleto das migrations representa o contrato DB-first da develop.
const BASE = "68639fd78c08d5717f942dee60325d992d1f71c3"
const value = process.env.OPERACOES_INTEGRADAS_TEST_DATABASE_URL
const url = bancoLocal(value)
const options = {
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
}
const db = await mariadb.createConnection(options)
try {
  assert.equal(
    (await db.query("SHOW TABLES")).length,
    0,
    "Banco não vazio; nenhuma tabela será substituída.",
  )
} finally {
  await db.end()
}
const git = spawnSync("git", ["show", `${BASE}:prisma/schema.prisma`], {
  encoding: "utf8",
  windowsHide: true,
  maxBuffer: 16000000,
})
assert.equal(git.status, 0, "Snapshot oficial indisponível.")
mkdirSync(".local", { recursive: true })
const dir = mkdtempSync(path.resolve(".local/operacoes-integradas-"))
const schema = path.join(dir, "base.prisma")
const sql = path.join(dir, "base.sql")
writeFileSync(schema, git.stdout)
function prisma(args) {
  const result = spawnSync(
    process.execPath,
    [path.resolve("node_modules/prisma/build/index.js"), ...args],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: value },
      windowsHide: true,
      maxBuffer: 16000000,
    },
  )
  assert.equal(result.status, 0, `Falha no preparo local: ${result.stderr}`)
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
let baseline = readFileSync(sql, "utf8")
// MariaDB recusa CASCADE de empresa NOT NULL para empresa nullable da grade.
// Somente esta reconstrução sintética usa RESTRICT, sem editar migrations antigas.
baseline = baseline.replace(
  /(CONSTRAINT `fk_item_venda_(?:cor|tamanho)`[^;]*ON UPDATE )CASCADE/g,
  "$1RESTRICT",
)
writeFileSync(sql, baseline)
prisma(["db", "execute", "--file", sql])
const complementos = await mariadb.createConnection(options)
try {
  for (const statement of [
    "ALTER TABLE estoque_minimo_local MODIFY data_atualizacao TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0)",
    "ALTER TABLE setores MODIFY data_atualizacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    "ALTER TABLE fluxos_producao MODIFY data_atualizacao DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
    "ALTER TABLE fluxo_producao_setor ADD CONSTRAINT chk_fluxo_setor_ordem CHECK (ordem BETWEEN 1 AND 100)",
    "ALTER TABLE ordem_producao ADD CONSTRAINT chk_op_quantidade_positiva CHECK (quantidade_planejada > 0 OR status IN ('PLANEJADA','CANCELADA'))",
    "ALTER TABLE ordem_producao_apontamento ADD CONSTRAINT chk_op_apontamento_quantidades CHECK (quantidade_produzida >= 0 AND quantidade_perdida >= 0 AND (quantidade_produzida > 0 OR quantidade_perdida > 0)), ADD CONSTRAINT chk_op_apontamento_motivo CHECK ((quantidade_perdida = 0 AND motivo_perda IS NULL) OR (quantidade_perdida > 0 AND motivo_perda IS NOT NULL AND CHAR_LENGTH(TRIM(motivo_perda)) > 0))",
    "ALTER TABLE contas_receber ADD CONSTRAINT ck_conta_receber_fechamento_saldo CHECK (id_fechamento IS NULL OR (saldo IS NOT NULL AND saldo >= 0 AND saldo <= valor_final))",
    "ALTER TABLE item_venda MODIFY id_produto_sem_pedido INT GENERATED ALWAYS AS (CASE WHEN id_pedido_cliente_item IS NULL THEN id_produto ELSE NULL END) STORED",
  ])
    await complementos.query(statement)
} finally {
  await complementos.end()
}
prisma([
  "db",
  "execute",
  "--file",
  "prisma/migrations/20261101000000_recebimentos_rastreaveis/migration.sql",
])
prisma([
  "db",
  "execute",
  "--file",
  "prisma/migrations/20261101010000_reservas_operacionais/migration.sql",
])
console.log(
  "Contrato da develop e extensões dos três cards preparados exclusivamente no banco local vazio; nenhuma adoção de histórico de migrations.",
)
