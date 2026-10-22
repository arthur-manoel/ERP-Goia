import { prisma } from "../../src/lib/prisma"
import {
  filtroPermissao,
  type Recurso,
  type CampoPermissao,
} from "../../src/lib/permissoes"
export type Resource = Recurso
export type Action = CampoPermissao
export async function allowedCompanies(
  id: number,
  recurso: Resource,
  action: Action,
) {
  const rows = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: id,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
      ...filtroPermissao(recurso, action),
    },
    select: { id_empresa: true },
  })
  return rows.map((row) => row.id_empresa)
}
