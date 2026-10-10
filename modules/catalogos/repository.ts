import { prisma } from "../../src/lib/prisma"
export type Resource = "PRODUTOS" | "CORES"
export type Action = "pode_ler" | "pode_criar" | "pode_editar" | "pode_excluir"
export async function allowedCompanies(
  id: number,
  recurso: Resource | null,
  action: Action,
) {
  const rows = await prisma.usuario_empresa.findMany({
    where: {
      id_usuario: id,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
      ...(recurso === null
        ? {}
        : { permissoes_usuario: { some: { recurso, [action]: true } } }),
    },
    select: { id_empresa: true },
  })
  return rows.map((row) => row.id_empresa)
}
