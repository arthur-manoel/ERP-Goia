import { loadEnvConfig } from "@next/env";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL local no .env.local antes de executar.");
  const url = new URL(process.env.DATABASE_URL);
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname.slice(1)) !== "joseev47_erp_dev") {
    throw new Error("Este script só permite MySQL local, no banco joseev47_erp_dev.");
  }
  const prisma = new PrismaClient({ adapter: new PrismaMariaDb({
    host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || 3306),
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database: "joseev47_erp_dev", connectionLimit: 1, connectTimeout: 5000,
  }) });
  try {
    // DDL fixo, aditivo e idempotente. Não executa db push nem altera tabelas existentes.
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT NOT NULL AUTO_INCREMENT,
        id_usuario INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        data_criacao DATETIME NOT NULL,
        data_expiracao DATETIME NOT NULL,
        revogado TINYINT(1) NOT NULL DEFAULT 0,
        data_revogacao DATETIME NULL,
        ip VARCHAR(45) NULL,
        user_agent VARCHAR(255) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uk_refresh_token (token),
        KEY idx_refresh_expiracao (data_expiracao),
        KEY idx_refresh_usuario (id_usuario),
        CONSTRAINT fk_refresh_token_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `;
    console.log("Tabela refresh_tokens disponível no banco local. Nenhuma tabela existente foi substituída.");
  } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha ao preparar refresh_tokens.");
  process.exitCode = 1;
});
