import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol)
  || url.searchParams.get("schema") !== "erp_auth_test") {
  throw new Error("Use uma DATABASE_URL PostgreSQL com ?schema=erp_auth_test para preparar o banco de testes.");
}
const directory = mkdtempSync(path.join(tmpdir(), "erp-postgresql-"));
const db = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  const output = path.join(directory, "schema.sql");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff",
    "--from-empty", "--to-schema", "prisma/postgresql/schema.prisma", "--script", "--output", output], { stdio: "inherit" });
  const sql = readFileSync(output, "utf8").replace('CREATE SCHEMA IF NOT EXISTS "public";', "");
  await db.connect();
  await db.query("BEGIN");
  // CREATE SCHEMA sem IF NOT EXISTS: nunca altera uma estrutura já existente.
  await db.query('CREATE SCHEMA "erp_auth_test"');
  await db.query('SET LOCAL search_path TO "erp_auth_test"');
  await db.query(sql);
  await db.query("COMMIT");
  console.log("Estrutura de teste criada no schema erp_auth_test. Nenhum usuário foi criado.");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  if (error.code === "42P06") console.log("Schema erp_auth_test já existe; nenhuma alteração realizada.");
  else {
    console.error("Falha ao preparar PostgreSQL:", error.code || error.name);
    process.exitCode = 1;
  }
} finally {
  await db.end();
  rmSync(directory, { recursive: true, force: true });
}
