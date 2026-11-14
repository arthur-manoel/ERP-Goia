import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import { ValidationError } from "../../src/lib/api/errors"

/** Mesma ordem do livro de estoque: vínculos primeiro, produto depois. */
export async function bloquearProdutoCatalogo(
  database: Prisma.TransactionClient,
  id: number,
) {
  await database.$queryRaw`SELECT id FROM produto_empresa WHERE id_produto = ${id} ORDER BY id_empresa, id FOR UPDATE`
  await database.$queryRaw`SELECT id FROM produtos WHERE id = ${id} FOR UPDATE`
}

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
