function registro(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}

// Classificação técnica compartilhada: não altera isolamento nem repete escritas.
export function disputaPersistencia(error: unknown): boolean {
  // 1020/ER_CHECKREAD também é disputa no snapshot MariaDB (inclusive P2039).
  // https://mariadb.com/docs/server/reference/error-codes/mariadb-error-codes-1000-to-1099/e1020
  if (!registro(error)) return false
  if (["P2002", "P2034"].includes(String(error.code))) return true
  const meta = registro(error.meta) ? error.meta : undefined
  const adapter =
    error.name === "DriverAdapterError" ? error : meta?.driverAdapterError
  const causa =
    registro(adapter) && registro(adapter.cause) ? adapter.cause : undefined
  return (
    causa?.kind === "TransactionWriteConflict" ||
    ["1062", "1020", "1213", "1205"].includes(
      String(causa?.originalCode ?? causa?.code),
    ) ||
    (error.code === "P2010" &&
      ["1062", "1020", "1213", "1205"].includes(String(meta?.code)))
  )
}
