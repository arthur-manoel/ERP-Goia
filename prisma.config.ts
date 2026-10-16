import { loadEnvConfig } from "@next/env"
import { defineConfig, env } from "prisma/config"
import { databaseProvider } from "./src/lib/database-config"

loadEnvConfig(process.cwd())

// O banco compartilhado continua protegido; migrations só no MySQL local.
const [command, subcommand] = process.argv.slice(2)
const databaseUrl = env("DATABASE_URL")
databaseProvider(databaseUrl)
const localMigration =
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

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
})
