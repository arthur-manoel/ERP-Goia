export function databaseProvider(databaseUrl: string): "mysql" | "postgresql" {
  const url = new URL(databaseUrl);
  if (url.protocol === "postgresql:" || url.protocol === "postgres:") return "postgresql";
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL deve usar mysql:// ou postgresql://.");
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== "joseev47_erp_dev") {
    throw new Error("O banco MySQL deve ser joseev47_erp_dev.");
  }
  return "mysql";
}

export function postgresqlNamespace(databaseUrl: string): string {
  const schema = new URL(databaseUrl).searchParams.get("schema") || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error("O schema PostgreSQL deve conter apenas letras minúsculas, números e underscore.");
  }
  return schema;
}
