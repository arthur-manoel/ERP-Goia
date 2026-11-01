import { prisma } from "../../src/lib/prisma"
import type { Prisma } from "../../src/generated/prisma/client"
import {
  recursoValido,
  acaoValida,
  type RecursoPermissao,
} from "@/lib/permissoes"
export type Resource = RecursoPermissao
export type Action = "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"
export async function allowedCompanies(
  id: number,
  recurso: Resource,
  action: Action,
  database: Pick<Prisma.TransactionClient, "usuario_empresa"> = prisma,
) {
  // Falhar fechado também em chamadas JS/legadas que escapem da tipagem.
  if (!recursoValido(recurso) || !acaoValida(action)) return []
  const authorization = {
    OR: [
      // Administração global ainda exige vínculo ativo com a empresa.
      { usuarios: { nivel_acesso: "ADMIN" as const } },
      // Responsáveis pela empresa administram os cadastros dela.
      { nivel_acesso: "EMPRESA" as const },
      // Demais usuários só recebem a operação explicitamente concedida.
      {
        permissoes_usuario: {
          some: { recurso, [action]: true },
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
      ...authorization,
    },
    select: { id_empresa: true },
  })
  return rows.map((row) => row.id_empresa)
}
