export function databaseProvider(databaseUrl: string): "mysql" | "postgresql" {
  const url = new URL(databaseUrl)
  if (url.protocol === "postgresql:" || url.protocol === "postgres:")
    return "postgresql"
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL deve usar mysql:// ou postgresql://.")
  }
  const database = decodeURIComponent(url.pathname.slice(1))
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (!database || (!local && database !== "joseev47_erp_dev")) {
    throw new Error(
      "Informe um banco MySQL local ou use joseev47_erp_dev no servidor remoto.",
    )
  }
  return "mysql"
}

export function postgresqlNamespace(databaseUrl: string): string {
  const schema = new URL(databaseUrl).searchParams.get("schema") || "public"
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error(
      "O schema PostgreSQL deve conter apenas letras minúsculas, números e underscore.",
    )
  }
  return schema
}
