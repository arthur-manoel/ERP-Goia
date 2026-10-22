import { prisma } from "../../src/lib/prisma"

export type Resource = "PRODUTOS" | "CORES" | "FINANCEIRO"
export type Action = "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"

export async function allowedCompanies(
  id: number,
  recurso: Resource | null,
  action: Action,
) {
  const permission = {
    permissoes_usuario: {
      some: { recurso: recurso as Resource, [action]: true },
    },
  }
  const authorization = {
    OR: [
      // Administração global ainda exige vínculo ativo com a empresa.
      { usuarios: { nivel_acesso: "ADMIN" as const } },
      // Contas e despesas exigem permissão financeira explícita. O nível
      // EMPRESA continua sendo administrador apenas dos catálogos usuais.
      ...(recurso === "FINANCEIRO"
        ? []
        : [{ nivel_acesso: "EMPRESA" as const }]),
      // Demais usuários só recebem a operação explicitamente concedida.
      permission,
    ],
  }

  const rows = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: id,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
      ...(recurso === null ? {} : authorization),
    },
    select: { id_empresa: true },
  })

  return rows.map((row) => row.id_empresa)
}
