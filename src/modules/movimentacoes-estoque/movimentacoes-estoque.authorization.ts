import "server-only"
import { requireRole } from "@/lib/authorize"
import { prisma } from "@/lib/prisma"
import { HttpError } from "@/lib/api/errors"

export type Contexto = { idEmpresa: number; idUsuario: number }
export async function autorizar(
  request: Request,
  acao: "ler" | "criar" | "editar",
): Promise<Contexto | Response> {
  const auth = await requireRole(request, [
    "ADMINISTRACAO",
    "PRODUCAO",
    "VENDAS",
    "FINANCEIRO",
  ])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new HttpError(401, "Não autenticado.")
  const vinculos = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    include: {
      usuarios: { select: { nivel_acesso: true } },
      permissoes_usuario: { where: { recurso: "ESTOQUE" } },
    },
  })
  const header = request.headers.get("X-Empresa-Id")
  if (header === null && vinculos.length > 1)
    throw new HttpError(400, "Informe X-Empresa-Id para selecionar a empresa.")
  const vinculo =
    header === null
      ? vinculos[0]
      : vinculos.find(
          (item) =>
            /^[1-9]\d*$/.test(header) && item.id_empresa === Number(header),
        )
  if (!vinculo) throw new HttpError(403, "Acesso negado à empresa.")
  const admin =
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  if (!admin && !vinculo.permissoes_usuario[0]?.[`pode_${acao}`])
    throw new HttpError(403, "Acesso negado ao estoque.")
  return { idEmpresa: vinculo.id_empresa, idUsuario }
}
