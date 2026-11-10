import type { Role } from "@/lib/auth-db"
import type { RecursoPermissao } from "@/lib/permissoes"

interface RoleSource {
  nivel_acesso: string
  usuario_empresa: Array<{
    status: string
    nivel_acesso: string
    empresas: { status: string }
    cargos: { nome: string; status: string }
    setores: {
      status: string
      permissoes_setor: Array<{ recurso: string }>
    } | null
  }>
}

/**
 * ADMINISTRACAO nunca é inferido de texto editável (nome de cargo, nome ou
 * tipo de setor). Ela vem somente de flags estáveis do banco:
 * `usuarios.nivel_acesso = ADMIN` ou `usuario_empresa.nivel_acesso = EMPRESA`.
 * Por isso este mapa de nomes de cargo só contém perfis funcionais.
 */
const perfisFuncionaisPorCargo: Record<string, Role> = {
  PRODUCAO: "PRODUCAO",
  VENDAS: "VENDAS",
  COMERCIAL: "VENDAS",
  FINANCEIRO: "FINANCEIRO",
}

/**
 * Perfil funcional que um recurso de `permissoes_setor` concede (portão
 * grosso de login). Recursos que não aparecem aqui não definem perfil.
 * Nenhum recurso concede ADMINISTRACAO.
 */
const perfilPorRecurso: Partial<Record<RecursoPermissao, Role>> = {
  ORDENS_PRODUCAO: "PRODUCAO",
  FLUXOS_PRODUCAO: "PRODUCAO",
  ESTOQUE: "PRODUCAO",
  CLIENTES: "VENDAS",
  PEDIDOS: "VENDAS",
  VENDAS: "VENDAS",
  FINANCEIRO: "FINANCEIRO",
}

export function perfisDosRecursos(recursos: readonly string[]): Set<Role> {
  const perfis = new Set<Role>()
  for (const recurso of recursos) {
    if (!Object.hasOwn(perfilPorRecurso, recurso)) continue
    const perfil = perfilPorRecurso[recurso as RecursoPermissao]
    if (perfil) perfis.add(perfil)
  }
  return perfis
}

function perfilDoCargo(nome: string): Role | undefined {
  const key = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
  return Object.hasOwn(perfisFuncionaisPorCargo, key)
    ? perfisFuncionaisPorCargo[key]
    : undefined
}

/** O JWT tem um único perfil global: vínculos ambíguos não recebem um perfil arbitrário. */
export function resolveUserRole(user: RoleSource): Role | null {
  if (user.nivel_acesso === "ADMIN") return "ADMINISTRACAO"
  const roles = new Set<Role>()
  for (const membership of user.usuario_empresa) {
    if (membership.status !== "ATIVO" || membership.empresas.status !== "ATIVA")
      continue
    if (membership.nivel_acesso === "EMPRESA") roles.add("ADMINISTRACAO")
    if (membership.cargos.status === "ATIVO") {
      const perfil = perfilDoCargo(membership.cargos.nome)
      if (perfil) roles.add(perfil)
    }
    if (membership.setores?.status === "ATIVO")
      for (const perfil of perfisDosRecursos(
        membership.setores.permissoes_setor.map((item) => item.recurso),
      ))
        roles.add(perfil)
  }
  return roles.size === 1 ? [...roles][0] : null
}
