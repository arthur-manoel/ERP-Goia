export function databaseProvider(databaseUrl: string): "mysql" {
  const url = new URL(databaseUrl)
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL deve usar mysql://.")
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
