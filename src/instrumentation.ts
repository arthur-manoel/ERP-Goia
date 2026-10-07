export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { prisma } = await import("@/lib/prisma")
    const { configureAuthDb } = await import("@/lib/auth-db")
    const { createPrismaAuthDb } =
      await import("@/modules/auth/auth.prisma-adapter")
    configureAuthDb(createPrismaAuthDb(prisma))
  }
}
