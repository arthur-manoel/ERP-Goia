import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { createWriteStream } from "node:fs"
import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createGzip } from "node:zlib"
import { pipeline } from "node:stream/promises"
import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL
  if (!value)
    throw new Error("DATABASE_URL não está definida no ambiente ou .env.local.")
  const url = new URL(value)
  if (url.protocol !== "mysql:")
    throw new Error("DATABASE_URL precisa usar mysql://.")
  if (!url.hostname || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL precisa informar host e nome do banco.")
  }
  return {
    host: url.hostname,
    port: url.port || "3306",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  }
}

function mysqlOption(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

const database = requiredDatabaseUrl()
const outputDirectory = path.resolve(
  process.env.MYSQL_BACKUP_DIR || ".backups/mysql",
)
const retentionDays = Number(process.env.MYSQL_BACKUP_RETENTION_DAYS || 30)
if (!Number.isInteger(retentionDays) || retentionDays < 1) {
  throw new Error(
    "MYSQL_BACKUP_RETENTION_DAYS precisa ser um inteiro maior que zero.",
  )
}

const timestamp = new Date()
  .toISOString()
  .replaceAll(":", "-")
  .replaceAll(".", "-")
const outputPath = path.join(
  outputDirectory,
  `${database.database}-${timestamp}.sql.gz`,
)
const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "erp-goia-mysql-backup-"),
)
const defaultsFile = path.join(temporaryDirectory, `client-${randomUUID()}.cnf`)
let outputCreated = false

try {
  await mkdir(outputDirectory, { recursive: true })
  await writeFile(
    defaultsFile,
    `[client]\nhost=${mysqlOption(database.host)}\nport=${mysqlOption(database.port)}\nuser=${mysqlOption(database.user)}\npassword=${mysqlOption(database.password)}\n`,
    { mode: 0o600, flag: "wx" },
  )

  const executable = process.env.MYSQLDUMP_PATH || "mysqldump"
  const child = spawn(
    executable,
    [
      `--defaults-extra-file=${defaultsFile}`,
      "--single-transaction",
      "--quick",
      "--routines",
      "--events",
      "--triggers",
      "--hex-blob",
      "--no-tablespaces",
      database.database,
    ],
    { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
  )

  const exit = new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", (code) => resolve(code))
  })
  const output = createWriteStream(outputPath, { flags: "wx" })
  output.once("open", () => {
    outputCreated = true
  })
  const dump = pipeline(child.stdout, createGzip(), output).catch((error) => {
    child.kill()
    throw error
  })
  const results = await Promise.allSettled([exit, dump])
  const failure = results.find((result) => result.status === "rejected")
  if (failure) throw failure.reason
  const [exitCode] = results.map((result) => result.value)
  if (exitCode !== 0)
    throw new Error(`mysqldump terminou com código ${exitCode}.`)

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const files = await readdir(outputDirectory, { withFileTypes: true })
  for (const file of files) {
    if (
      !file.isFile() ||
      !file.name.startsWith(`${database.database}-`) ||
      !file.name.endsWith(".sql.gz")
    )
      continue
    const filePath = path.join(outputDirectory, file.name)
    if (filePath === outputPath) continue
    const details = await stat(filePath)
    if (details.mtimeMs < cutoff) await rm(filePath)
  }

  console.log(`Backup criado: ${outputPath}`)
} catch (error) {
  if (outputCreated) await rm(outputPath, { force: true })
  throw error
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}
