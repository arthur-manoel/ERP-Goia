import { beforeAll, describe, expect, it, vi } from "vitest";
import { hash } from "bcryptjs";
import { NextRequest } from "next/server";
import { POST as login } from "../../../src/app/api/auth/login/route";
import { POST as refresh } from "../../../src/app/api/auth/refresh/route";
import { POST as logout } from "../../../src/app/api/auth/logout/route";
import { GET as me } from "../../../src/app/api/auth/me/route";
import { hashToken, newRefreshToken, verifyAccessToken } from "../../../src/lib/auth/tokens";
import { db } from "../../helpers/prisma";
import { origin, request } from "../../helpers/http";

const usuario = { id: 1, nome: "Usuário", email: "user@example.test", status: "ATIVO" };
let senha: string;
beforeAll(async () => { senha = await hash("senha-segura", 4); });
function cookieRequest(path: string, token?: string) {
  return new NextRequest(origin + path, { method: "POST", headers: { origin,
    ...(token ? { cookie: `erp_refresh=${token}` } : {}) } });
}
describe("autenticação HTTP", () => {
  it("login grava somente hash e envia tokens em cookies HttpOnly", async () => {
    db.usuarios.findUnique.mockResolvedValue({ ...usuario, senha });
    db.refresh_tokens.create.mockResolvedValue({ id: 7 });
    const response = await login(await request("/api/auth/login", "POST", { email: usuario.email, senha: "senha-segura" }, false));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { usuario: { id: 1, nome: usuario.nome, email: usuario.email } } });
    const raw = response.cookies.get("erp_refresh")!.value;
    expect(raw).toHaveLength(43);
    expect(db.refresh_tokens.create.mock.calls[0][0].data.token).toBe(hashToken(raw));
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await verifyAccessToken(response.cookies.get("erp_access")!.value)).toEqual({ usuarioId: 1, sessionId: 7 });
  });
  it.each([null, "wrong", "inactive"])("login rejeita usuário/senha inválidos (%s)", async (mode) => {
    db.usuarios.findUnique.mockResolvedValue(mode === null ? null : { ...usuario, senha, status: mode === "inactive" ? "INATIVO" : "ATIVO" });
    const response = await login(await request("/api/auth/login", "POST", { email: usuario.email,
      senha: mode === "wrong" ? "errada" : "senha-segura" }, false));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("Email ou senha inválidos.");
    expect(db.refresh_tokens.create).not.toHaveBeenCalled();
  });
  it("valida corpo do login", async () => {
    expect((await login(await request("/api/auth/login", "POST", { email: "invalido" }, false))).status).toBe(400);
  });
  it("consulta a sessão sem expor senha ou refresh token", async () => {
    const response = await me(await request("/api/auth/me"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.usuario).toEqual({ id: 1, nome: "Usuário", email: "user@example.test" });
  });
  it("recusa access token de sessão revogada", async () => {
    db.refresh_tokens.findFirst.mockResolvedValue(null);
    expect((await me(await request("/api/auth/me"))).status).toBe(401);
  });
  it("rotaciona atomicamente e mantém a expiração absoluta", async () => {
    const raw = newRefreshToken(); const nextExpiry = new Date(Date.now() + 60_000);
    db.refresh_tokens.findUnique.mockResolvedValue({ id: 1, id_usuario: 1, revogado: false, data_expiracao: nextExpiry, usuarios: usuario });
    db.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });
    db.refresh_tokens.create.mockResolvedValue({ id: 2, data_expiracao: nextExpiry });
    const response = await refresh(cookieRequest("/api/auth/refresh", raw));
    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.refresh_tokens.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { token: hashToken(raw) } }));
    expect(db.refresh_tokens.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      id: 1, revogado: false, data_expiracao: { gt: expect.any(Date) },
    } }));
    const rotated = response.cookies.get("erp_refresh")!.value;
    expect(rotated).not.toBe(raw);
    expect(db.refresh_tokens.create).toHaveBeenCalledWith({ data: {
      id_usuario: 1, token: hashToken(rotated), data_criacao: expect.any(Date), data_expiracao: nextExpiry,
    } });
  });
  it.each(["replay", "concurrent"])("revoga sessões quando detecta %s, sem criar outro token", async (mode) => {
    db.refresh_tokens.findUnique.mockResolvedValue({ id: 1, id_usuario: 1, revogado: mode === "replay",
      data_expiracao: new Date(Date.now() + 60_000), usuarios: usuario });
    db.refresh_tokens.updateMany.mockResolvedValue({ count: 0 });
    const response = await refresh(cookieRequest("/api/auth/refresh", newRefreshToken()));
    expect(response.status).toBe(401);
    expect(db.refresh_tokens.updateMany).toHaveBeenLastCalledWith({ where: { id_usuario: 1, revogado: false },
      data: { revogado: true, data_revogacao: expect.any(Date) } });
    expect(db.refresh_tokens.create).not.toHaveBeenCalled();
    expect(response.cookies.get("erp_refresh")!.value).toBe("");
  });
  it.each(["missing", "malformed", "unknown", "expired", "inactive"])("recusa refresh %s", async (mode) => {
    db.refresh_tokens.findUnique.mockResolvedValue(mode === "unknown" ? null : {
      id: 1, id_usuario: 1, revogado: false,
      data_expiracao: new Date(Date.now() + (mode === "expired" ? -60_000 : 60_000)),
      usuarios: { ...usuario, status: mode === "inactive" ? "INATIVO" : "ATIVO" },
    });
    const response = await refresh(cookieRequest("/api/auth/refresh", mode === "missing" ? undefined : mode === "malformed" ? "abc" : newRefreshToken()));
    expect(response.status).toBe(401); expect(db.refresh_tokens.create).not.toHaveBeenCalled();
  });
  it("logout revoga hash e limpa os dois cookies nos paths corretos", async () => {
    const raw = newRefreshToken(); db.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });
    const response = await logout(cookieRequest("/api/auth/logout", raw));
    expect(response.status).toBe(200);
    expect(db.refresh_tokens.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { token: hashToken(raw), revogado: false } }));
    expect(response.cookies.get("erp_refresh")!.path).toBe("/api/auth");
    expect(response.cookies.get("erp_access")!.maxAge).toBe(0);
    expect(response.cookies.get("erp_refresh")!.maxAge).toBe(0);
  });
  it.each([login, refresh, logout])("rejeita requisição sem origem antes de executar autenticação", async (route) => {
    expect((await route(new Request(origin + "/api/auth/login", { method: "POST" }))).status).toBe(403);
    expect(db.refresh_tokens.updateMany).not.toHaveBeenCalled();
  });
  it("oculta erro do banco e não limpa cookies num refresh com falha temporária", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$transaction.mockRejectedValue(new Error("detalhes internos"));
    const response = await refresh(cookieRequest("/api/auth/refresh", newRefreshToken()));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Erro interno do servidor." });
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
