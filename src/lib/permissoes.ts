import type { permissoes_usuario_recurso } from "@/generated/prisma/enums"

export const RECURSOS_PERMISSAO = [
  "PRODUTOS",
  "ESTOQUE",
  "NOTAS_FISCAIS",
  "ORDENS_PRODUCAO",
  "CORES",
  "MODELOS",
  "CATEGORIAS",
  "CLIENTES",
  "PEDIDOS",
  "FINANCEIRO",
  "COMPRAS",
  "FORNECEDORES",
  "SETORES",
  "VENDAS",
  "RELATORIOS",
  "FLUXOS_PRODUCAO",
  "TAMANHOS",
  "TIPOS_PRODUTO",
] as const satisfies readonly permissoes_usuario_recurso[]

export type RecursoPermissao = permissoes_usuario_recurso
export type AcaoPermissao =
  "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"

export function recursoValido(recurso: unknown): recurso is RecursoPermissao {
  return RECURSOS_PERMISSAO.some((item) => item === recurso)
}

export function acaoValida(acao: unknown): acao is AcaoPermissao {
  return ["pode_ler", "pode_criar", "pode_editar", "pode_excluir"].includes(
    String(acao),
  )
}
