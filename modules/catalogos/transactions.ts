import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"

/** Protocolo compartilhado por categorias e produtos: bloquear as empresas
 * antes de validar vínculos e manter o bloqueio até concluir a gravação.
 * A ordem estável evita inversão de bloqueios em operações entre empresas.
 */
export function withCompaniesLock<T>(
  companies: number[],
  operation: (database: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(
    async (database) => {
      await database.$queryRaw`
        SELECT id FROM empresas
        WHERE id IN (${Prisma.join([...new Set(companies)].sort((a, b) => a - b))})
        ORDER BY id FOR UPDATE
      `
      return operation(database)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  )
}
