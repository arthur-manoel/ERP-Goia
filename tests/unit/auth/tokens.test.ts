import { expect, it } from "vitest";
import { SignJWT } from "jose";
import { hashToken, newRefreshToken, signingKey, signAccessToken, verifyAccessToken } from "../../../src/lib/auth/tokens";
import { UnauthorizedError } from "../../../src/lib/api/errors";
it("gera tokens imprevisíveis e hashes de tamanho fixo", () => {
  const raw = newRefreshToken();
  expect(raw).not.toBe(newRefreshToken()); expect(raw).toHaveLength(43);
  expect(hashToken(raw)).toMatch(/^[a-f0-9]{64}$/);
});
it("verifica usuário e sessão assinados", async () => {
  expect(await verifyAccessToken(await signAccessToken(3, 7))).toEqual({ usuarioId: 3, sessionId: 7 });
});
it("rejeita assinatura adulterada", async () => {
  const token = await signAccessToken(3, 7);
  const parts = token.split("."); parts[1] = Buffer.from(JSON.stringify({ sub: "99" })).toString("base64url");
  await expect(verifyAccessToken(parts.join("."))).rejects.toBeInstanceOf(UnauthorizedError);
});
it("rejeita token expirado", async () => {
  const token = await new SignJWT({ sid: 1, type: "access" }).setProtectedHeader({ alg: "HS256" })
    .setSubject("1").setIssuer("erp-goia").setAudience("erp-goia-session").setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(signingKey());
  await expect(verifyAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedError);
});
it("não usa segredo default quando configuração está ausente", () => {
  delete process.env.AUTH_SECRET;
  expect(signingKey).toThrow("AUTH_SECRET");
});
