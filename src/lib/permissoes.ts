import type {
  Prisma,
  permissoes_usuario_recurso,
} from "@/generated/prisma/client"

export const recursos = [
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

export type Recurso = (typeof recursos)[number]
export type Acao = "ler" | "criar" | "editar" | "excluir"
export type CampoPermissao = `pode_${Acao}`
type Permissao = { recurso: string } & Partial<Record<CampoPermissao, boolean>>
type Vinculo = {
  nivel_acesso: string
  usuarios: { nivel_acesso: string }
  permissoes_usuario: readonly Permissao[]
}

export function administrador(
  vinculo: Pick<Vinculo, "nivel_acesso" | "usuarios">,
) {
  return (
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  )
}

// Recebe somente vínculos de usuário e empresa ativos, consultados no servidor.
export function temPermissao(vinculo: Vinculo, recurso: Recurso, acao: Acao) {
  if (
    !recursos.includes(recurso) ||
    !["ler", "criar", "editar", "excluir"].includes(acao)
  )
    return false
  return (
    administrador(vinculo) ||
    vinculo.permissoes_usuario.some(
      (permissao) =>
        permissao.recurso === recurso && permissao[`pode_${acao}`] === true,
    )
  )
}

export function filtroPermissao(
  recurso: Recurso,
  campo: CampoPermissao,
): Prisma.usuario_empresaWhereInput {
  if (
    !recursos.includes(recurso) ||
    !["pode_ler", "pode_criar", "pode_editar", "pode_excluir"].includes(campo)
  ) {
    // Evita que um recurso omitido se transforme em consulta sem filtro.
    return { id: { in: [] } }
  }
  return {
    OR: [
      { usuarios: { nivel_acesso: "ADMIN" } },
      { nivel_acesso: "EMPRESA" },
      { permissoes_usuario: { some: { recurso, [campo]: true } } },
    ],
  }
}
