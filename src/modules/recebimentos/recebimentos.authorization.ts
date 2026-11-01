import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { requireRole } from "@/lib/authorize"
import { HttpError } from "@/lib/api/errors"
import { prisma } from "@/lib/prisma"

export type ContextoRecebimento = { idEmpresa: number; idUsuario: number }
export async function conferirAcessoRecebimento(
  tx: Pick<Prisma.TransactionClient, "usuario_empresa">,
  ctx: ContextoRecebimento,
  escrita: boolean,
) {
  const vinculo = await tx.usuario_empresa.findFirst({
    where: {
      id_usuario: ctx.idUsuario,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    include: {
      usuarios: { select: { nivel_acesso: true } },
      permissoes_usuario: { where: { recurso: "FINANCEIRO" } },
    },
  })
  const permissao = vinculo?.permissoes_usuario.find(
    (p) => p.recurso === "FINANCEIRO",
  )
  if (
    !vinculo ||
    (!(
      vinculo.nivel_acesso === "EMPRESA" ||
      vinculo.usuarios.nivel_acesso === "ADMIN"
    ) &&
      (!permissao?.pode_ler || (escrita && !permissao.pode_editar)))
  )
    throw new HttpError(403, "Sem permissão financeira na empresa ativa.")
}
export async function autorizarRecebimento(
  request: Request,
  escrita: boolean,
): Promise<ContextoRecebimento | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "FINANCEIRO"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (
    !Number.isSafeInteger(idUsuario) ||
    idUsuario < 1 ||
    idUsuario > 2147483647
  )
    throw new HttpError(401, "Não autenticado.")
  const vinculos = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    select: { id_empresa: true },
  })
  const header = request.headers.get("X-Empresa-Id")
  if (header === null && vinculos.length > 1)
    throw new HttpError(400, "Informe X-Empresa-Id para selecionar a empresa.")
  const vinculo =
    header === null
      ? vinculos[0]
      : vinculos.find(
          (v) =>
            /^[1-9]\d{0,9}$/.test(header) && v.id_empresa === Number(header),
        )
  if (!vinculo) throw new HttpError(403, "Acesso negado à empresa.")
  const ctx = { idEmpresa: vinculo.id_empresa, idUsuario }
  await conferirAcessoRecebimento(prisma, ctx, escrita)
  return ctx
}
