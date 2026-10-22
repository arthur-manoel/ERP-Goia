import "server-only"
import { requireRole } from "@/lib/authorize"
import { temPermissao } from "@/lib/permissoes"
import {
  ClienteError,
  vinculosAtivos,
  type Contexto,
} from "./clientes.repository"

export async function autorizar(
  request: Request,
  acao: "ler" | "criar" | "editar" | "excluir",
): Promise<Contexto | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "VENDAS"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new ClienteError(401, "Não autenticado.")
  const vinculos = await vinculosAtivos(idUsuario)
  const header = request.headers.get("X-Empresa-Id")
  // O header seleciona um vínculo ativo; nunca concede acesso, mesmo para ADMIN.
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
      throw new ClienteError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new ClienteError(403, "Acesso negado à empresa.")
  }
  if (!temPermissao(vinculo, "CLIENTES", acao))
    throw new ClienteError(403, "Acesso negado.")
  return {
    idUsuario,
    idEmpresa: vinculo.id_empresa,
    podeExcluir: temPermissao(vinculo, "CLIENTES", "excluir"),
  }
}
