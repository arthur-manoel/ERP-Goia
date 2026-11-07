import "server-only"
import { requireRole } from "@/lib/authorize"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import {
  recursoValido,
  acaoValida,
  type RecursoPermissao,
} from "@/lib/permissoes"
import {
  ProducaoError,
  vinculosAtivos,
  type Contexto,
} from "./producao.repository"

export async function autorizar(
  request: Request,
  acao: "ler" | "criar" | "editar" | "excluir",
  recurso: RecursoPermissao = "ORDENS_PRODUCAO",
): Promise<Contexto | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "PRODUCAO"])
  if (auth.error) return auth.error
  if (!recursoValido(recurso) || !acaoValida(`pode_${acao}`))
    throw new ProducaoError(403, "Recurso ou ação de produção inválido.")
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new ProducaoError(401, "Não autenticado.")
  enforceRateLimit(
    request,
    {
      scope: acao === "ler" ? "producao:read" : "producao:write",
      limit: acao === "ler" ? 120 : 30,
      windowMs: 60_000,
    },
    String(idUsuario),
  )
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
