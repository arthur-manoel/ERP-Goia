import { beforeEach, vi } from "vitest"
import { db } from "./helpers/prisma"

vi.mock("../src/lib/prisma", async () => ({
  prisma: (await import("./helpers/prisma")).db,
}))
vi.mock("server-only", () => ({}))
vi.mock("../src/lib/jwt", () => ({
  verifyAccessToken: (token: string) =>
    token === "test-token" ? { id: 1, role: "ADMINISTRACAO" } : null,
}))
beforeEach(() => {
  vi.resetAllMocks()
  db.usuario_empresa.findMany.mockResolvedValue([{ id_empresa: 10 }])
  db.$transaction.mockImplementation(async (operation) =>
    typeof operation === "function" ? operation(db) : Promise.all(operation),
  )
})
