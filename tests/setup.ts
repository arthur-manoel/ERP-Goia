import { beforeEach, vi } from "vitest"
import { db } from "./helpers/prisma"

vi.mock("../src/lib/prisma", async () => ({
  prisma: (await import("./helpers/prisma")).db,
}))
beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async (operation) =>
    typeof operation === "function" ? operation(db) : Promise.all(operation),
  )
})
