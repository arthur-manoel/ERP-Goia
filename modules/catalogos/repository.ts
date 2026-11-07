import { prisma } from "../../src/lib/prisma"
import type { Prisma } from "../../src/generated/prisma/client"
export type Resource =
  "PRODUTOS" | "CORES" | "FINANCEIRO" | "CATEGORIAS" | "FORNECEDORES"
export type Action = "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"
import {
  recursoValido,
  acaoValida,
  type RecursoPermissao,
} from "@/lib/permissoes"
// Resource mantém a assinatura pública dos catálogos; a autorização cobre os 18 recursos.
export async function allowedCompanies(
  id: number,
  recurso: RecursoPermissao,
  action: Action,
  database: Pick<Prisma.TransactionClient, "usuario_empresa"> = prisma,
) {
  // Falhar fechado também em chamadas JS/legadas que escapem da tipagem.
  if (!recursoValido(recurso) || !acaoValida(action)) return []
  const rows = await database.usuario_empresa.findMany({
    where: vinculoCatalogo(id, recurso, [action]),
    select: { id_empresa: true },
  })
  return rows.map((row) => row.id_empresa)
}

export function vinculoCatalogo(
  id: number,
  recurso: RecursoPermissao,
  actions: Action[],
): Prisma.usuario_empresaWhereInput {
  return {
    id_usuario: id,
    status: "ATIVO",
    usuarios: { status: "ATIVO" },
    empresas: { status: "ATIVA" },
    OR: [
      // Administração global ainda exige vínculo ativo com a empresa.
      { usuarios: { nivel_acesso: "ADMIN" as const } },
      // Responsáveis pela empresa administram os cadastros dela.
      { nivel_acesso: "EMPRESA" as const },
      // Demais usuários só recebem a operação explicitamente concedida.
      {
        permissoes_usuario: {
          some: {
            recurso,
            ...Object.fromEntries(actions.map((action) => [action, true])),
          },
        },
      },
    ],
  }
}
