import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import type { Role } from "@/lib/auth-db"
import { toSessionUser, userInclude } from "./auth.prisma-adapter"
import { lockUsers, revokeUserSessions } from "./auth.repository"

export async function perfisAntesDeAlterarSetor(
  tx: Prisma.TransactionClient,
  idSetor: number,
) {
  const vinculos = await tx.usuario_empresa.findMany({
    where: {
      id_setor: idSetor,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
    },
    select: { id_usuario: true },
    distinct: ["id_usuario"],
  })
  const ids = vinculos.map((vinculo) => vinculo.id_usuario)
  await lockUsers(tx, ids)
  return perfisAtuais(tx, ids)
}

async function perfisAtuais(tx: Prisma.TransactionClient, ids: number[]) {
  if (!ids.length) return new Map<number, Role | null>()
  const usuarios = await tx.usuarios.findMany({
    where: { id: { in: ids } },
    include: userInclude,
  })
  return new Map(
    usuarios.map((usuario) => [
      usuario.id,
      toSessionUser(usuario)?.role ?? null,
    ]),
  )
}

export async function revogarPerfisAlterados(
  tx: Prisma.TransactionClient,
  antes: Map<number, Role | null>,
) {
  if (!antes.size) return
  const depois = await perfisAtuais(tx, [...antes.keys()])
  const alterados = [...antes.keys()].filter(
    (id) => antes.get(id) !== depois.get(id),
  )
  if (alterados.length) await revokeUserSessions(tx, alterados)
}
