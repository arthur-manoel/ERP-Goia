import "server-only"
import type { Prisma } from "@/generated/prisma/client"
/** Disponibilidade para novas operações, sem alterar vínculos ou compras históricas. */
export const fornecedorDisponivel = (
  idEmpresa: number,
): Prisma.fornecedoresWhereInput => ({
  status: "ATIVO",
  OR: [
    { id_empresa: idEmpresa },
    {
      id_empresa: null,
      empresa_fornecedor: { some: { id_empresa: idEmpresa, status: "ATIVO" } },
    },
  ],
})
