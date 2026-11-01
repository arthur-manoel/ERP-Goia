import { prisma } from "../../src/lib/prisma"
import type { Prisma } from "../../src/generated/prisma/client"
export type Resource =
  "PRODUTOS" | "CORES" | "FINANCEIRO" | "CATEGORIAS" | "FORNECEDORES"
export type Action = "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"
export async function allowedCompanies(
  id: number,
  recurso: Resource | null,
  action: Action,
  database: Pick<Prisma.TransactionClient, "usuario_empresa"> = prisma,
) {
  const authorization = {
    OR: [
      // Administração global ainda exige vínculo ativo com a empresa.
      { usuarios: { nivel_acesso: "ADMIN" as const } },
      // Responsáveis pela empresa administram os cadastros dela.
      { nivel_acesso: "EMPRESA" as const },
      // Demais usuários só recebem a operação explicitamente concedida.
      {
        permissoes_usuario: {
          some: { recurso: recurso as Resource, [action]: true },
        },
      },
    ],
  }
  const rows = await database.usuario_empresa.findMany({
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
