import { beforeEach, vi } from "vitest"
import { db } from "./helpers/prisma"

vi.mock("../src/lib/prisma", async () => ({
  prisma: (await import("./helpers/prisma")).db,
}))
vi.mock("server-only", () => ({}))
vi.mock("../src/lib/jwt", () => ({
  verifyAccessToken: (token: string) => {
    if (token === "test-token") return { id: 1, role: "ADMINISTRACAO" }
    if (token === "finance-token") return { id: 2, role: "FINANCEIRO" }
    if (token === "production-token") return { id: 3, role: "PRODUCAO" }
    return null
  },
}))
beforeEach(() => {
  vi.resetAllMocks()
  db.usuario_empresa.findMany.mockResolvedValue([{ id_empresa: 10 }])
  db.pagamentos_receber.aggregate.mockResolvedValue({
    _sum: { valor: null },
    _count: { _all: 0 },
    _min: { valor: null, id_empresa: null },
    _max: { id_empresa: null },
  })
  db.$transaction.mockImplementation(async (operation) =>
    typeof operation === "function" ? operation(db) : Promise.all(operation),
  )
})
