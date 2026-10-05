import "server-only"
import { requireRole } from "@/lib/authorize"
import {
  administrador,
  UsuarioError,
  vinculosAtivos,
  type Contexto,
} from "./usuarios.repository"

export async function autorizar(
  request: Request,
): Promise<Contexto | Response> {
  // Perfil funcional não substitui a verificação de administrador no banco.
  const auth = await requireRole(request, [
    "ADMINISTRACAO",
    "PRODUCAO",
    "VENDAS",
    "FINANCEIRO",
  ])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new UsuarioError(401, "Não autenticado.")
  const vinculos = await vinculosAtivos(idUsuario)
  const header = request.headers.get("X-Empresa-Id")
  const vinculo =
    header !== null
      ? vinculos.find(
          (item) =>
            /^[1-9]\d*$/.test(header) && item.id_empresa === Number(header),
        )
      : vinculos.length === 1
        ? vinculos[0]
        : undefined
  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new UsuarioError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new UsuarioError(403, "Acesso negado à empresa.")
  }
  if (!administrador(vinculo))
    throw new UsuarioError(
      403,
      "Somente administradores da empresa podem cadastrar funcionários.",
    )
  return { idUsuario, idEmpresa: vinculo.id_empresa }
}
