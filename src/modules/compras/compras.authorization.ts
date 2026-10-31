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
export type Recurso = "ESTOQUE" | "NOTAS_FISCAIS"
const recursoDaArea: Record<Area, Recurso> = {
  requisicoes: "ESTOQUE",
  pedidos: "ESTOQUE",
  compras: "ESTOQUE",
  opcoes: "ESTOQUE",
  notas: "NOTAS_FISCAIS",
}

/**
 * Seletores (opcoes) servem telas de Compras (ESTOQUE) e de Notas Fiscais (NOTAS_FISCAIS).
 * Fornecedores, pedidos e compras podem ser consultados por quem tem QUALQUER dos dois recursos,
 * sem ampliar nada além de leitura e sempre dentro da empresa do vínculo.
 * Insumos, locais e setores continuam exigindo ESTOQUE.
 */
export function recursosDaOpcao(tipo: string | null): Recurso[] {
  return tipo === "fornecedores" || tipo === "pedidos" || tipo === "compras"
    ? ["ESTOQUE", "NOTAS_FISCAIS"]
    : ["ESTOQUE"]
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
