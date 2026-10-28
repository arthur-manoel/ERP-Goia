import type { Prisma } from "../../src/generated/prisma/client"
import { ValidationError } from "../../src/lib/api/errors"
import { findForUpdate } from "./repository"

/** A mesma linha é bloqueada por transferências e por novas associações. */
export async function assertProductCategory(
  id: number,
  companies: number[],
  database: Prisma.TransactionClient,
) {
  const category = await findForUpdate(id, companies, database)
  if (
    !category ||
    category.status !== "ATIVA" ||
    category.id_empresa === null ||
    companies.length === 0 ||
    companies.some((company) => company !== category.id_empresa)
  )
    throw new ValidationError(
      "Categoria inexistente, inativa ou incompatível com a empresa do produto.",
    )
}
