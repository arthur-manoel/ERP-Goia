import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { ValidationError } from "../../src/lib/api/errors"

/** Categorias e associações de produtos usam a mesma ordem de locks no MySQL. */
export function withCompanyWriteLock<T>(
  companies: number[],
  operation: (database: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(
    async (database) => {
      const ids = [...new Set(companies)].sort((a, b) => a - b)
      if (!ids.length) throw new ValidationError("Informe uma empresa ativa.")
      const rows = await database.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM empresas WHERE id IN (${Prisma.join(ids)}) AND status = 'ATIVA'
      ORDER BY id FOR UPDATE
    `
      if (rows.length !== ids.length)
        throw new ValidationError("Empresa inexistente ou inativa.")
      return operation(database)
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      timeout: 15_000,
    },
  )
}
