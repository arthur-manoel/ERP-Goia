import { loadEnvConfig } from "@next/env";
import { defineConfig, env } from "prisma/config";

loadEnvConfig(process.cwd());

// migrate dev cria um segundo banco automaticamente, mesmo sem shadowDatabaseUrl.
const args = process.argv.slice(2);
if (args.some((arg, index) => arg === "migrate" && args[index + 1] === "dev")) {
  throw new Error(
    "migrate dev exige shadow database e não é permitido neste projeto. Use npm run db:migrate (migrate deploy), somente em joseev47_erp_dev.",
  );
}

const databaseUrl = env("DATABASE_URL");
if (decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) !== "joseev47_erp_dev") {
  throw new Error("DATABASE_URL deve apontar somente para joseev47_erp_dev.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --conditions=react-server --import tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
