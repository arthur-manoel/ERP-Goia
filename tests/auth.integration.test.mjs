import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";
import nextEnv from "@next/env";

const configuredDatabase = process.argv.includes("--configured-db");
if (configuredDatabase) nextEnv.loadEnvConfig(process.cwd());
const databaseUrl = process.env.AUTH_TEST_DATABASE_URL || (configuredDatabase ? process.env.DATABASE_URL : undefined);

test("Banco real: login, rotação, logout, expiração, reuso e concorrência", {
  skip: !databaseUrl && "Defina AUTH_TEST_DATABASE_URL ou use --configured-db para o banco de testes configurado",
}, async () => {
  const url = new URL(databaseUrl);
  if (["postgres:", "postgresql:"].includes(url.protocol)) {
    assert.equal(url.searchParams.get("schema"), "erp_auth_test");
  } else {
    assert.equal(url.protocol, "mysql:");
    assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
    assert.ok(url.pathname.length > 1, "Informe o nome do banco local de testes");
  }
  process.env.DATABASE_URL = databaseUrl;
  process.env.ACCESS_TOKEN_SECRET = "integration-test-secret-only";

  // Carrega os módulos de produção, sem substituir Prisma ou o repository.
  const { registerHooks } = await import("node:module");
  assert.equal(typeof registerHooks, "function", "Use Node >=22.15 para o teste de integração");
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") {
        return { url: "data:text/javascript,export {};", shortCircuit: true };
      }
      const candidate = specifier.startsWith("@/")
        ? pathToFileURL(path.resolve("src", specifier.slice(2))).href
        : specifier.startsWith(".") ? new URL(specifier, context.parentURL).href : null;
      if (candidate?.startsWith("file:") && existsSync(fileURLToPath(candidate + ".ts"))) {
        return { url: candidate + ".ts", shortCircuit: true };
      }
      return next(specifier, context);
    },
    load(url, context, next) {
      if (url.startsWith("file:") && url.endsWith(".ts")) {
        return {
          format: "module", shortCircuit: true,
          source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
          }).outputText,
        };
      }
      return next(url, context);
    },
  });
  let prisma;
  const userIds = [];
  try {
    ({ prisma } = await import("../src/lib/prisma.ts"));
    const service = await import("../src/modules/auth/auth.service.ts");
    const { configureAuthDb } = await import("../src/lib/auth-db.ts");
    const { createPrismaAuthDb } = await import("../src/modules/auth/auth.prisma-adapter.ts");
    configureAuthDb(createPrismaAuthDb(prisma));
    const password = "integration-test-password";
    for (let i = 0; i < 2; i++) {
      const user = await prisma.usuarios.create({ data: {
        nome: "Auth integration", email: `${randomUUID()}@example.test`,
        senha: await service.hashPassword(password), nivel_acesso: "ADMIN",
      } });
      userIds.push(user.id);
    }
    const user = await prisma.usuarios.findUniqueOrThrow({ where: { id: userIds[0] } });
    const credentials = { email: user.email, password };
    assert.equal(await service.login({ ...credentials, password: "incorrect" }), null);
    const logged = await service.login(credentials);
    assert.ok(service.verifyAccessToken(logged.accessToken));
    const digest = token => createHash("sha256").update(token).digest("hex");
    const rowFor = token => prisma.refresh_tokens.findUniqueOrThrow({ where: { token: digest(token) } });
    const first = await rowFor(logged.refreshToken);
    assert.equal(typeof first.id, "number");
    assert.equal(first.id_usuario, user.id);
    assert.equal(first.revogado, false);
    assert.equal(first.data_revogacao, null);
    assert.ok(first.data_criacao instanceof Date);
    assert.ok(Math.abs(first.data_expiracao - Date.now() - 604800000) < 5000);

    const otherSession = await service.issueRefreshToken(user.id);
    const otherUser = await service.issueRefreshToken(userIds[1]);
    const renewed = await service.refresh(logged.refreshToken);
    assert.ok(service.verifyAccessToken(renewed.accessToken));
    const rotated = await rowFor(logged.refreshToken);
    assert.equal(rotated.replaced_by, (await rowFor(renewed.refreshToken)).id);
    assert.equal(rotated.revogado, true);
    assert.ok(rotated.data_revogacao instanceof Date);
    assert.equal(await service.refresh(logged.refreshToken), null);
    for (const token of [renewed.refreshToken, otherSession]) {
      assert.equal(await service.refresh(token), null);
      assert.ok((await rowFor(token)).data_revogacao instanceof Date);
    }
    assert.ok(await service.refresh(otherUser));

    const session = await service.login(credentials);
    await service.logout(session.refreshToken);
    const loggedOut = await rowFor(session.refreshToken);
    await service.logout(session.refreshToken);
    assert.equal((await rowFor(session.refreshToken)).data_revogacao.getTime(), loggedOut.data_revogacao.getTime());
    assert.equal(await service.refresh(session.refreshToken), null);

    const expired = await service.issueRefreshToken(user.id);
    await prisma.refresh_tokens.update({ where: { token: digest(expired) }, data: { data_expiracao: new Date("2020-01-01") } });
    assert.equal(await service.refresh(expired), null);
    const concurrent = await service.issueRefreshToken(user.id);
    const results = await Promise.all([service.rotateRefreshToken(concurrent), service.rotateRefreshToken(concurrent)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await service.refresh(results.find(Boolean).token), null);
  } finally {
    if (prisma) {
      try {
        if (userIds.length) await prisma.usuarios.deleteMany({ where: { id: { in: userIds } } });
      } finally {
        await prisma.$disconnect();
      }
    }
    hooks.deregister();
  }
});
