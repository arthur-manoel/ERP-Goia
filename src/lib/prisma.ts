import "server-only"
import { PrismaPg } from "@prisma/adapter-pg"
import { databaseProvider, postgresqlNamespace } from "./database-config"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../generated/prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("Defina DATABASE_URL no .env.local.")

  if (databaseProvider(databaseUrl) === "postgresql") {
    return new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          max: 5,
          connectionTimeoutMillis: 10000,
        },
        { schema: postgresqlNamespace(databaseUrl) },
      ),
    })
  }
  const url = new URL(databaseUrl)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 5,
    connectTimeout: 5000,
    acquireTimeout: 10000,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
