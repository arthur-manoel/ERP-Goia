import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const nativeRequire = createRequire(import.meta.url);

// Executa os módulos reais com cookies e persistência isolados do servidor Next.
function setup() {
  const cache = new Map();
  const jar = new Map();
  const options = new Map();
  const tokens = new Map();
  const rawQueries = [];
  process.env.ACCESS_TOKEN_SECRET = "test-secret-for-jwt-tests-only";
  const users = new Map();
  const db = {
    async getUserByEmail(email) { return [...users.values()].find(u => u.email === email) ?? null; },
    async getUserById(id) { return users.get(id) ?? null; },
  };
  let sequence = 0;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const table = {
    async findUnique({ where }) { return [...tokens.values()].find(row => matches(row, where)) ?? null; },
    async create({ data }) {
      const row = { id: String(++sequence), revoked: false, replacedBy: null, ...data };
      tokens.set(row.id, row);
      return row;
    },
    async update({ where, data }) {
      const row = await this.findUnique({ where });
      Object.assign(row, data);
      return row;
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of tokens.values()) if (matches(row, where)) { Object.assign(row, data); count++; }
      return { count };
    },
  };
  let queue = Promise.resolve();
  const prisma = {
    async $transaction(fn) {
      const result = queue.then(async () => {
        const snapshot = structuredClone(tokens);
        try { return await fn({ refreshToken: table, $queryRaw: async () => [], $queryRawUnsafe: async (sql, ...values) => { rawQueries.push({ sql, values }); return []; } }); }
        catch (error) { tokens.clear(); for (const [id, row] of snapshot) tokens.set(id, row); throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = (id) => {
      if (id === "./prisma" || id === "@/lib/prisma") return { prisma };
      if (id === "server-only") return {};
      if (id === "next/headers") return { cookies: async () => ({
        get: name => jar.has(name) ? { value: jar.get(name) } : undefined,
        set: (name, value, config) => { jar.set(name, value); options.set(name, config); },
      }) };
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.resolve(path.dirname(file), `${id}.ts`));
      return nativeRequire(id);
    };
    new Function("require", "module", "exports", source)(localRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  load("src/lib/auth-db.ts").configureAuthDb(db);
  return { load, db, jar, options, tokens, users, prisma, rawQueries };
}

test("Argon2id: senha correta, incorreta e hash inválido", async () => {
  const { load } = setup();
  const { hashPassword, verifyPassword } = load("src/lib/password.ts");
  const hash = await hashPassword("senha de teste");
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword("senha de teste", hash), true);
  assert.equal(await verifyPassword("outra", hash), false);
  assert.equal(await verifyPassword("senha", "inválido"), false);
});

test("JWT: validade, expiração, assinatura, algoritmo e RBAC sem banco", async () => {
  const { load } = setup();
  const { signAccessToken, verifyAccessToken } = load("src/lib/jwt.ts");
  const { requireRole } = load("src/lib/authorize.ts");
  const jwt = nativeRequire("jsonwebtoken");
  const token = signAccessToken({ id: 1, role: "VENDAS" });
  const payload = jwt.decode(token);
  assert.equal(payload.exp - payload.iat, 900);
  assert.deepEqual(verifyAccessToken(token), { id: 1, role: "VENDAS" });
  for (const invalid of ["bad", token + "x",
    jwt.sign({ id: 1, role: "VENDAS" }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: -1 }),
    jwt.sign({ id: 1, role: "ADMIN" }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: 900 }),
    jwt.sign({ id: 1, role: "VENDAS" }, process.env.ACCESS_TOKEN_SECRET, { algorithm: "HS384", expiresIn: 900 }),
    jwt.sign({ id: 1, role: "VENDAS" }, process.env.ACCESS_TOKEN_SECRET),
  ]) assert.equal(verifyAccessToken(invalid), null);
  const req = value => new Request("http://localhost", { headers: value ? { Authorization: value } : {} });
  assert.equal((await requireRole(req(), ["VENDAS"])).error.status, 401);
  assert.equal((await requireRole(req("Bearer bad"), ["VENDAS"])).error.status, 401);
  assert.equal((await requireRole(req(`Bearer ${token}`), ["FINANCEIRO"])).error.status, 403);
  assert.equal((await requireRole(req(`Bearer ${token}`), ["VENDAS"])).user.id, 1);
});

test("refresh: hash, rotação, reuso revoga todo o usuário, expiração e logout", async () => {
  const { load, tokens } = setup();
  const { issueRefreshToken, rotateRefreshToken, revokeRefreshToken } = load("src/lib/refreshToken.ts");
  const first = await issueRefreshToken(1);
  const otherSession = await issueRefreshToken(1);
  const otherUser = await issueRefreshToken(2);
  const row = [...tokens.values()][0];
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(row.tokenHash, first);
  assert.equal(row.tokenHash, nativeRequire("node:crypto").createHash("sha256").update(first).digest("hex"));
  assert.ok(Math.abs(row.expiresAt - Date.now() - 604800000) < 2000);
  const next = await rotateRefreshToken(first);
  assert.equal(next.userId, 1);
  assert.notEqual(next.token, first);
  assert.equal(row.revoked, true);
  assert.ok(tokens.has(row.replacedBy));
  assert.equal(await rotateRefreshToken(first), null);
  assert.equal(await rotateRefreshToken(next.token), null);
  assert.equal(await rotateRefreshToken(otherSession), null);
  assert.ok(await rotateRefreshToken(otherUser));
  const expired = await issueRefreshToken(3);
  [...tokens.values()].find(t => t.userId === 3).expiresAt = new Date(0);
  assert.equal(await rotateRefreshToken(expired), null);
  const revoked = await issueRefreshToken(4);
  await revokeRefreshToken(revoked);
  await revokeRefreshToken(revoked);
  assert.equal(await rotateRefreshToken(revoked), null);
  assert.equal(await rotateRefreshToken("missing"), null);
});

test("rotação concorrente: somente uma vence e o reuso revoga a sucessora", async () => {
  const { load, tokens } = setup();
  const { issueRefreshToken, rotateRefreshToken } = load("src/lib/refreshToken.ts");
  const token = await issueRefreshToken(1);
  const results = await Promise.all([rotateRefreshToken(token), rotateRefreshToken(token)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.ok([...tokens.values()].every(t => t.revoked));
});

test("rotas: login, refresh, perfil atual, cookies, reuso e logout", async () => {
  const { load, users, tokens, jar, options } = setup();
  const { hashPassword } = load("src/lib/password.ts");
  const login = load("src/app/api/auth/login/route.ts").POST;
  const refresh = load("src/app/api/auth/refresh/route.ts").POST;
  const logout = load("src/app/api/auth/logout/route.ts").POST;
  const request = body => new Request("http://localhost/api/auth/login", { method: "POST", body });
  for (const body of ["{", "null", "{}", '{"email":123,"password":"x"}']) {
    assert.equal((await login(request(body))).status, 400);
  }
  assert.equal((await refresh()).status, 401);
  const credentials = password => request(JSON.stringify({ email: "ana@example.com", password }));
  assert.equal((await login(credentials("senha"))).status, 401);
  users.set(1, { id: 1, name: "Ana", email: "ana@example.com", role: "VENDAS", passwordHash: await hashPassword("senha") });
  assert.equal((await login(credentials("errada"))).status, 401);
  assert.equal(tokens.size, 0);
  const success = await login(credentials("senha"));
  assert.equal(success.status, 200);
  assert.ok((await success.json()).accessToken);
  const first = jar.get("refresh_token");
  assert.deepEqual(options.get("refresh_token"), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth", maxAge: 604800,
  });
  users.get(1).role = "FINANCEIRO";
  const renewed = await refresh();
  assert.equal(renewed.status, 200);
  assert.equal(load("src/lib/jwt.ts").verifyAccessToken((await renewed.json()).accessToken).role, "FINANCEIRO");
  assert.notEqual(jar.get("refresh_token"), first);
  jar.set("refresh_token", first);
  assert.equal((await refresh()).status, 401);
  assert.ok([...tokens.values()].every(t => t.revoked));
  await login(credentials("senha"));
  assert.deepEqual(await (await logout()).json(), { ok: true });
  assert.equal(options.get("refresh_token").maxAge, 0);
  assert.equal(options.get("refresh_token").path, "/api/auth");
  assert.ok([...tokens.values()].every(t => t.revoked));
  assert.equal((await logout()).status, 200);
  await login(credentials("senha"));
  users.delete(1);
  assert.equal((await refresh()).status, 401);
  assert.ok([...tokens.values()].every(t => t.revoked));
});

test("schema: limites e normalização preservam o contrato de login", () => {
  const { load } = setup();
  const { loginSchema } = load("src/modules/auth/auth.schema.ts");
  assert.deepEqual(loginSchema.parse({ email: " ana@example.com ", password: " senha " }), {
    email: "ana@example.com", password: " senha ",
  });
  for (const input of [null, [], {}, { email: "ana@example.com", password: "" },
    { email: "ana@example.com", password: "x".repeat(1025) },
    { email: "x".repeat(250) + "@example.com", password: "x" },
    { email: "ana@localhost", password: "x" },
    { email: "ana@example.com", password: 123 },
  ]) assert.equal(loginSchema.safeParse(input).success, false);
});

test("repository: rollback desfaz criação e revogação na mesma transação", async () => {
  const { load, tokens } = setup();
  const service = load("src/modules/auth/auth.service.ts");
  const repository = load("src/modules/auth/auth.repository.ts");
  await service.issueRefreshToken(1);
  const original = structuredClone([...tokens.values()]);
  await assert.rejects(repository.withUserTokens(1, async (db) => {
    await db.rotateRefreshToken(original[0].id, {
      userId: 1, tokenHash: "next", expiresAt: new Date(Date.now() + 10000),
    });
    throw new Error("rollback");
  }), /rollback/);
  assert.deepEqual([...tokens.values()], original);
});

test("adapter Prisma: tradução, perfil atual e rejeição de usuários inativos", async () => {
  const { load } = setup();
  const { createPrismaAuthDb } = load("src/modules/auth/auth.prisma-adapter.ts");
  const row = { id: 1, nome: "Ana", email: "ana@example.com", senha: "hash", status: "ATIVO" };
  const queries = [];
  let currentRole = "VENDAS";
  const adapter = createPrismaAuthDb({ usuarios: {
    async findUnique({ where }) {
      queries.push(where);
      return Object.entries(where).every(([key, value]) => row[key] === value) ? row : null;
    },
  } }, () => currentRole);
  assert.deepEqual(await adapter.getUserByEmail(row.email), {
    id: 1, name: "Ana", passwordHash: "hash", role: "VENDAS",
  });
  currentRole = "FINANCEIRO";
  assert.deepEqual(await adapter.getUserById("1"), { id: 1, name: "Ana", role: "FINANCEIRO" });
  assert.equal(await adapter.getUserByEmail("missing@example.com"), null);
  assert.equal(await adapter.getUserById("invalid"), null);
  assert.deepEqual(queries[1], { id: 1 });
  row.status = "INATIVO";
  assert.equal(await adapter.getUserById(1), null);
  row.status = "ATIVO";
  currentRole = null;
  assert.equal(await adapter.getUserByEmail(row.email), null);
});

test("perfis Prisma: administrador, setores, cargos, vínculos inativos e ambiguidade", () => {
  const { load } = setup();
  const { resolveUserRole } = load("src/modules/auth/auth.role.ts");
  const membership = (name) => ({
    status: "ATIVO", empresas: { status: "ATIVA" },
    cargos: { nome: name, status: "ATIVO" }, setores: null,
  });
  assert.equal(resolveUserRole({ nivel_acesso: "ADMIN", usuario_empresa: [] }), "ADMINISTRACAO");
  for (const [name, role] of [[" produção ", "PRODUCAO"], ["Comercial", "VENDAS"],
    ["Financeiro", "FINANCEIRO"], ["Administrativo", "ADMINISTRACAO"]]) {
    assert.equal(resolveUserRole({ nivel_acesso: "USUARIO", usuario_empresa: [membership(name)] }), role);
  }
  const user = { nivel_acesso: "USUARIO", usuario_empresa: [membership("Operador")] };
  assert.equal(resolveUserRole(user), null);
  user.usuario_empresa[0].setores = { nome: "Costura", tipo: "Produção", status: "ATIVO" };
  assert.equal(resolveUserRole(user), "PRODUCAO");
  user.usuario_empresa.push(membership("Vendas"));
  assert.equal(resolveUserRole(user), null);
  user.usuario_empresa[1].status = "INATIVO";
  assert.equal(resolveUserRole(user), "PRODUCAO");
  user.usuario_empresa[0].empresas.status = "INATIVA";
  assert.equal(resolveUserRole(user), null);
});

test("instrumentation: inicializa adapter Prisma antes do login e ignora Edge", async () => {
  const { load, prisma } = setup();
  delete globalThis.authDb;
  const previousRuntime = process.env.NEXT_RUNTIME;
  try {
    const { register } = load("src/instrumentation.ts");
    process.env.NEXT_RUNTIME = "edge";
    await register();
    assert.throws(() => load("src/lib/auth-db.ts").getAuthDb(), /Configure/);
    const hash = await load("src/lib/password.ts").hashPassword("senha de teste");
    prisma.usuarios = { async findUnique() {
      return { id: 1, nome: "Teste", senha: hash, status: "ATIVO", nivel_acesso: "ADMIN", usuario_empresa: [] };
    } };
    process.env.NEXT_RUNTIME = "nodejs";
    await register();
    const response = await load("src/app/api/auth/login/route.ts").POST(new Request("http://localhost/api/auth/login", {
      method: "POST", body: JSON.stringify({ email: "teste@example.com", password: "senha de teste" }),
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.name, "Teste");
    assert.equal(body.role, "ADMINISTRACAO");
    assert.ok(body.accessToken);
    assert.equal("passwordHash" in body, false);
  } finally {
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = previousRuntime;
  }
});


test("configuração de banco: MySQL preservado e PostgreSQL com schema validado", () => {
  const { load } = setup();
  const { databaseProvider, postgresqlNamespace } = load("src/lib/database-config.ts");
  assert.equal(databaseProvider("mysql://localhost/joseev47_erp_dev"), "mysql");
  assert.throws(() => databaseProvider("mysql://localhost/outro"));
  assert.equal(databaseProvider("postgresql://localhost/postgres"), "postgresql");
  assert.equal(databaseProvider("postgres://localhost/postgres"), "postgresql");
  assert.throws(() => databaseProvider("https://localhost/postgres"));
  assert.equal(postgresqlNamespace("postgresql://localhost/postgres"), "public");
  assert.equal(postgresqlNamespace("postgresql://localhost/postgres?schema=erp_auth_test"), "erp_auth_test");
  assert.throws(() => postgresqlNamespace("postgresql://localhost/postgres?schema=bad%22schema"));
});

test("PostgreSQL: bloqueio de rotação qualifica schema e parametriza ID", async () => {
  const { load, rawQueries } = setup();
  const previousUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://localhost/postgres?schema=erp_auth_test";
    await load("src/modules/auth/auth.service.ts").issueRefreshToken(42);
    assert.deepEqual(rawQueries, [{
      sql: 'SELECT id FROM "erp_auth_test"."usuarios" WHERE id = $1 FOR UPDATE', values: [42],
    }]);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
