import type { Role } from "@/lib/auth-db"

interface RoleSource {
  nivel_acesso: string
  usuario_empresa: Array<{
    status: string
    empresas: { status: string }
    cargos: { nome: string; status: string }
    setores: { nome: string; tipo: string; status: string } | null
  }>
}

const aliases: Record<string, Role> = {
  ADMINISTRACAO: "ADMINISTRACAO",
  ADMINISTRATIVO: "ADMINISTRACAO",
  PRODUCAO: "PRODUCAO",
  VENDAS: "VENDAS",
  COMERCIAL: "VENDAS",
  FINANCEIRO: "FINANCEIRO",
}

function namedRole(value: string): Role | undefined {
  const key = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
  return Object.hasOwn(aliases, key) ? aliases[key] : undefined
}

/** O JWT tem um único perfil global: vínculos ambíguos não recebem um perfil arbitrário. */
export function resolveUserRole(user: RoleSource): Role | null {
  if (user.nivel_acesso === "ADMIN") return "ADMINISTRACAO"
  const roles = new Set<Role>()
  for (const membership of user.usuario_empresa) {
    if (membership.status !== "ATIVO" || membership.empresas.status !== "ATIVA")
      continue
    const names: string[] = []
    if (membership.cargos.status === "ATIVO") names.push(membership.cargos.nome)
    if (membership.setores?.status === "ATIVO") {
      names.push(membership.setores.nome, membership.setores.tipo)
    }
    for (const name of names) {
      const role = namedRole(name)
      if (role) roles.add(role)
    }
  }
  return roles.size === 1 ? [...roles][0] : null
}
