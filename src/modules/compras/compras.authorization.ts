import "server-only"
import { requireRole } from "@/lib/authorize"
import {
  ComprasError,
  vinculosAtivos,
  type Acao,
  type Contexto,
} from "./compras.repository"

/**
 * O enum `permissoes_usuario_recurso` NÃO possui COMPRAS (e criar o valor exige migration do
 * responsável pelo banco). Até lá, o módulo reutiliza os recursos existentes mais próximos:
 *   - solicitações, pedidos e compras → ESTOQUE (compras de insumos abastecem o estoque)
 *   - notas fiscais                   → NOTAS_FISCAIS
 * Administradores (usuarios.nivel_acesso = ADMIN ou vínculo EMPRESA) dispensam permissões individuais.
 */
export type Area = "requisicoes" | "pedidos" | "compras" | "notas" | "opcoes"
const recursoDaArea = {
  requisicoes: "ESTOQUE",
  pedidos: "ESTOQUE",
  compras: "ESTOQUE",
  opcoes: "ESTOQUE",
  notas: "NOTAS_FISCAIS",
} as const

export async function autorizar(
  request: Request,
  area: Area,
  acao: Acao,
): Promise<Contexto | Response> {
  const auth = await requireRole(request, ["ADMINISTRACAO", "PRODUCAO", "FINANCEIRO"])
  if (auth.error) return auth.error
  const idUsuario = Number(auth.user.id)
  if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0)
    throw new ComprasError(401, "Não autenticado.")
  const vinculos = await vinculosAtivos(idUsuario)
  const header = request.headers.get("X-Empresa-Id")
  // O header apenas seleciona um vínculo ativo; nunca concede acesso, nem a administradores.
  const vinculo =
    header !== null
      ? vinculos.find(
          (item) => /^[1-9]\d*$/.test(header) && item.id_empresa === Number(header),
        )
      : vinculos.length === 1
        ? vinculos[0]
        : undefined
  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new ComprasError(400, "Informe X-Empresa-Id para selecionar a empresa.")
    throw new ComprasError(403, "Acesso negado à empresa.")
  }
  const admin =
    vinculo.nivel_acesso === "EMPRESA" || vinculo.usuarios.nivel_acesso === "ADMIN"
  const permissao = vinculo.permissoes_usuario.find(
    (item) => item.recurso === recursoDaArea[area],
  )
  const pode: Contexto["pode"] = {
    ler: admin || Boolean(permissao?.pode_ler),
    criar: admin || Boolean(permissao?.pode_criar),
    editar: admin || Boolean(permissao?.pode_editar),
    excluir: admin || Boolean(permissao?.pode_excluir),
  }
  if (!pode[acao]) throw new ComprasError(403, "Acesso negado.")
  return { idUsuario, idEmpresa: vinculo.id_empresa, pode }
}
