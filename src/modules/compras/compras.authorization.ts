import "server-only"
import { requireRole } from "@/lib/authorize"
import {
  ComprasError,
  vinculosAtivos,
  type Acao,
  type Contexto,
} from "./compras.repository"

/**
 * Recursos explícitos do enum ampliado:
 *   - solicitações, pedidos e compras → COMPRAS
 *   - notas fiscais                   → NOTAS_FISCAIS
 * Administradores (usuarios.nivel_acesso = ADMIN ou vínculo EMPRESA) dispensam permissões individuais.
 */
export type Area = "requisicoes" | "pedidos" | "compras" | "notas" | "opcoes"
export type Recurso = "COMPRAS" | "NOTAS_FISCAIS"
const recursoDaArea: Record<Area, Recurso> = {
  requisicoes: "COMPRAS",
  pedidos: "COMPRAS",
  compras: "COMPRAS",
  opcoes: "COMPRAS",
  notas: "NOTAS_FISCAIS",
}

/**
 * Seletores (opcoes) servem telas de Compras e de Notas Fiscais.
 * Opções podem ser consultadas por quem tem QUALQUER dos dois recursos,
 * sem ampliar nada além de leitura e sempre dentro da empresa do vínculo.
 * O acesso a seletores é restrito à leitura necessária ao documento de origem.
 */
export function recursosDaOpcao(tipo: string | null): Recurso[] {
  return [
    "insumos",
    "fornecedores",
    "locais",
    "setores",
    "pedidos",
    "compras",
  ].includes(tipo ?? "")
    ? ["COMPRAS", "NOTAS_FISCAIS"]
    : []
}

export async function autorizar(
  request: Request,
  area: Area,
  acao: Acao,
  recursos: Recurso[] = [recursoDaArea[area]],
): Promise<Contexto | Response> {
  const auth = await requireRole(request, [
    "ADMINISTRACAO",
    "PRODUCAO",
    "FINANCEIRO",
  ])
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
          (item) =>
            /^[1-9]\d*$/.test(header) && item.id_empresa === Number(header),
        )
      : vinculos.length === 1
        ? vinculos[0]
        : undefined
  if (!vinculo) {
    if (header === null && vinculos.length > 1)
      throw new ComprasError(
        400,
        "Informe X-Empresa-Id para selecionar a empresa.",
      )
    throw new ComprasError(403, "Acesso negado à empresa.")
  }
  const admin =
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  const permissoes = vinculo.permissoes_usuario.filter((item) =>
    recursos.includes(item.recurso as Recurso),
  )
  const pode: Contexto["pode"] = {
    ler: admin || permissoes.some((item) => item.pode_ler),
    criar: admin || permissoes.some((item) => item.pode_criar),
    editar: admin || permissoes.some((item) => item.pode_editar),
    excluir: admin || permissoes.some((item) => item.pode_excluir),
  }
  if (!pode[acao]) throw new ComprasError(403, "Acesso negado.")
  return { idUsuario, idEmpresa: vinculo.id_empresa, pode }
}
