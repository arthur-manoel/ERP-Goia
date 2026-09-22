import { loadEnvConfig } from "@next/env"
import { defineConfig, env } from "prisma/config"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { databaseProvider } from "./src/lib/database-config"
import { postgresqlSchema } from "./scripts/postgresql-schema"

loadEnvConfig(process.cwd())

// O banco compartilhado continua protegido; migrations só no MySQL local.
const [command, subcommand] = process.argv.slice(2)
const databaseUrl = env("DATABASE_URL")
const provider = databaseProvider(databaseUrl)
const cliUrl =
  provider === "postgresql"
    ? process.env.DIRECT_URL || databaseUrl
    : databaseUrl
if (databaseProvider(cliUrl) !== provider) {
  throw new Error("DIRECT_URL e DATABASE_URL devem usar o mesmo tipo de banco.")
}
const localMigration =
  provider === "mysql" &&
  command === "migrate" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)
const alteraEstrutura =
  (command === "migrate" && subcommand !== "diff") ||
  (command === "db" && subcommand === "push")
if (alteraEstrutura && !localMigration) {
  throw new Error(
    `prisma ${command} ${subcommand ?? ""} não é permitido: o banco é a fonte da verdade. Altere a estrutura no MySQL e rode npm run db:pull.`,
  )
}

let schema = "prisma/schema.prisma"
if (provider === "postgresql") {
  if (command === "db" && subcommand === "pull") {
    throw new Error(
      "db:pull é reservado ao schema MySQL; o schema PostgreSQL de testes é derivado dele.",
    )
  }
  mkdirSync("prisma/postgresql", { recursive: true })
  schema = "prisma/postgresql/schema.prisma"
  writeFileSync(
    schema,
    postgresqlSchema(readFileSync("prisma/schema.prisma", "utf8")),
  )
}

export default defineConfig({
  schema,
  datasource: {
    url: cliUrl,
  },
})
