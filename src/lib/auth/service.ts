import { compare } from "bcryptjs";
import { UnauthorizedError } from "../api/errors";
import { validate } from "../api/http";
import * as repository from "./repository";
import { loginSchema, refreshTokenSchema } from "./schema";
import { hashToken, newRefreshToken, REFRESH_SECONDS, signAccessToken, signingKey, verifyAccessToken } from "./tokens";

// Bcrypt válido para equalizar o trabalho quando o usuário não existe.
const dummyHash = "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
export async function login(input: unknown) {
  const data = validate(loginSchema, input);
  signingKey();
  const usuario = await repository.findUsuario(data.email);
  const passwordHash = usuario?.senha.replace(/^\$2y\$/, "$2b$") ?? dummyHash;
  const valid = await compare(data.senha, passwordHash);
  if (!usuario || usuario.status !== "ATIVO" || !valid) throw new UnauthorizedError("Email ou senha inválidos.");
  const refreshToken = newRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_SECONDS * 1000);
  const session = await repository.createSession(usuario.id, hashToken(refreshToken), expiresAt);
  return { accessToken: await signAccessToken(usuario.id, session.id), refreshToken, expiresAt,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } };
}
export async function refresh(input: unknown) {
  const parsed = refreshTokenSchema.safeParse(input);
  if (!parsed.success) throw new UnauthorizedError();
  signingKey();
  const refreshToken = newRefreshToken();
  const result = await repository.rotateSession(hashToken(parsed.data), hashToken(refreshToken));
  if (!result) throw new UnauthorizedError("Sessão expirada, revogada ou reutilizada. Entre novamente.");
  return { accessToken: await signAccessToken(result.usuario.id, result.session.id), refreshToken,
    expiresAt: result.session.data_expiracao, usuario: result.usuario };
}
export async function logout(input: unknown) {
  const parsed = refreshTokenSchema.safeParse(input);
  if (parsed.success) await repository.revokeSession(hashToken(parsed.data));
  return { message: "Sessão encerrada." };
}
export async function authenticate(token: string | undefined) {
  if (!token) throw new UnauthorizedError();
  const claims = await verifyAccessToken(token);
  const session = await repository.findActiveSession(claims.sessionId, claims.usuarioId);
  if (!session) throw new UnauthorizedError();
  return session.usuarios;
}
