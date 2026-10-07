import { Prisma } from "@/generated/prisma/client"

function registro(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
function conflitoAdapter(error: unknown): boolean {
  if (
    !registro(error) ||
    error.name !== "DriverAdapterError" ||
    !registro(error.cause)
  )
    return false
  const cause = error.cause
  return (
    [
      "UniqueConstraintViolation",
      "ForeignKeyConstraintViolation",
      "TransactionWriteConflict",
    ].includes(String(cause.kind)) ||
    ["1062", "1451", "1452", "1213", "1205"].includes(
      String(cause.originalCode),
    )
  )
}
// Prisma 7 com driver adapter pode entregar DriverAdapterError diretamente nas
// consultas raw, ou dentro de meta.driverAdapterError. Não classificar falhas
// de schema/conexão como conflito de negócio.
export function conflitoPersistencia(error: unknown): boolean {
  if (conflitoAdapter(error)) return true
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (["P2002", "P2003", "P2004", "P2025", "P2034"].includes(error.code))
    return true
  if (error.code !== "P2010") return false
  return (
    conflitoAdapter(error.meta?.driverAdapterError) ||
    ["1062", "1451", "1452", "1213", "1205"].includes(String(error.meta?.code))
  )
}
