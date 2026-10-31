import "server-only"
import { requireRole } from "@/lib/authorize"
import { HttpError } from "@/lib/api/errors"
import { handleRequest } from "@/lib/api/http"
import { prisma } from "@/lib/prisma"

export function contextoHandler(request: Request) {
  return handleRequest(async () => {
    const auth = await requireRole(request, [
      "ADMINISTRACAO",
      "PRODUCAO",
      "VENDAS",
      "FINANCEIRO",
    ])
    if (auth.error) throw new HttpError(auth.error.status, "Não autenticado.")
    const idUsuario = Number(auth.user.id)
    if (
      !Number.isSafeInteger(idUsuario) ||
      idUsuario <= 0 ||
      idUsuario > 2_147_483_647
    )
      throw new HttpError(401, "Não autenticado.")
    const vinculos = await prisma.usuario_empresa.findMany({
      where: {
        id_usuario: idUsuario,
        status: "ATIVO",
        usuarios: { status: "ATIVO" },
        empresas: { status: "ATIVA" },
      },
      select: {
        id_empresa: true,
        empresas: { select: { razao_social: true } },
        usuarios: { select: { nome: true, email: true } },
      },
      orderBy: { id_empresa: "asc" },
    })
    if (!vinculos.length)
      throw new HttpError(403, "Sem vínculo ativo com uma empresa.")
    return {
      usuario: vinculos[0].usuarios,
      empresas: vinculos.map((item) => ({
        id: item.id_empresa,
        nome: item.empresas.razao_social,
      })),
    }
  })
}
