import "server-only"
import { requireRole } from "@/lib/authorize"
import {
  ProducaoError,
  vinculosAtivos,
  type Contexto,
} from "./producao.repository"

export async function autorizar(
  request: Request,
  acao: "ler" | "criar" | "editar" | "excluir",
  recurso: "ORDENS_PRODUCAO" | "PRODUTOS" = "ORDENS_PRODUCAO",
): Promise<Contexto | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "PRODUCAO"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new ProducaoError(401, "Não autenticado.")
  const vinculos = await vinculosAtivos(idUsuario)
  const header = request.headers.get("X-Empresa-Id")
  // Mesmo administradores precisam de vínculo ativo; o header nunca concede acesso.
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
      throw new ProducaoError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new ProducaoError(403, "Acesso negado à empresa.")
  }
  const admin =
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  const permissao = vinculo.permissoes_usuario.find(
    (item) => item.recurso === recurso,
  )
  if (!admin && !permissao?.[`pode_${acao}`])
    throw new ProducaoError(403, "Acesso negado.")
  return { idUsuario, idEmpresa: vinculo.id_empresa }
}
