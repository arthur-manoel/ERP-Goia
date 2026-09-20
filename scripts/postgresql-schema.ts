/** Deriva o schema de testes sem modificar o schema/migrations do MySQL. */
export function postgresqlSchema(mysqlSchema: string): string {
  return "// Gerado de prisma/schema.prisma; não editar.\n" + mysqlSchema
    .replace('provider = "mysql"', 'provider = "postgresql"')
    .replace('output   = "../src/generated/prisma"', 'output   = "../../src/generated/prisma"')
    .replaceAll("@db.DateTime(", "@db.Timestamp(")
    .replaceAll("@db.LongText", "@db.Text")
    .replaceAll("@db.UnsignedBigInt", "@db.BigInt")
    // Os nomes de constraints MySQL não são portáveis para o namespace PostgreSQL.
    .replace(/\(map: "[^"]+"\)/g, "")
    .replace(/, map: "[^"]+"/g, "");
}
