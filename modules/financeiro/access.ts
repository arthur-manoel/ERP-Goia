import type { Prisma } from "../../src/generated/prisma/client"
import { HttpError } from "../../src/lib/api/errors"
import { allowedCompanies } from "../catalogos/repository"
import type { FinancialActor } from "./auditoria"

/** Cancelamento é exclusão lógica, independentemente do verbo HTTP utilizado. */
export async function assertCanCancel(
  actor: FinancialActor,
  companies: number[],
  database: Prisma.TransactionClient,
) {
  const allowed = await allowedCompanies(
    actor.idUsuario,
    "FINANCEIRO",
    "pode_excluir",
    database,
  )
  if (companies.some((company) => !allowed.includes(company)))
    throw new HttpError(403, "Sem permissão para cancelar nesta empresa.")
}
