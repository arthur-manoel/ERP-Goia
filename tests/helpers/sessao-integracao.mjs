import { createHash } from "node:crypto"

export async function tokenDeSessao(prisma, id, role) {
  const { issueRefreshToken, signAccessToken } =
    await import("../../src/modules/auth/auth.service.ts")
  const refresh = await issueRefreshToken(id)
  const token = createHash("sha256").update(refresh).digest("hex")
  const { sessao_id: sid } = await prisma.refresh_tokens.findUniqueOrThrow({
    where: { token },
    select: { sessao_id: true },
  })
  return signAccessToken({ id, role, sid })
}
