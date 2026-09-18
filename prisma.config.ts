import { loadEnvConfig } from "@next/env";
import { defineConfig, env } from "prisma/config";

loadEnvConfig(process.cwd());

// Fluxo DB-first: a estrutura do banco é mantida direto no MySQL e trazida com db pull.
// Bloqueia comandos que alterariam o banco compartilhado a partir do schema.
const [command, subcommand] = process.argv.slice(2);
const alteraEstrutura =
  (command === "migrate" && subcommand !== "diff") ||
  (command === "db" && subcommand === "push");
if (alteraEstrutura) {
  throw new Error(
    `prisma ${command} ${subcommand ?? ""} não é permitido: o banco é a fonte da verdade. Altere a estrutura no MySQL e rode npm run db:pull.`,
  );
}

const databaseUrl = env("DATABASE_URL");
if (decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) !== "joseev47_erp_dev") {
  throw new Error("DATABASE_URL deve apontar somente para joseev47_erp_dev.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
