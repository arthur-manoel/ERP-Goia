import { beforeEach, vi } from "vitest";
import { db } from "./helpers/prisma";

vi.mock("../src/lib/prisma", async () => ({ prisma: (await import("./helpers/prisma")).db }));
beforeEach(() => {
  vi.resetAllMocks();
  process.env.AUTH_SECRET = "segredo-exclusivo-dos-testes-nao-utilizar-em-producao";
  db.$transaction.mockImplementation(async (operation) =>
    typeof operation === "function" ? operation(db) : Promise.all(operation));
  db.refresh_tokens.findFirst.mockResolvedValue({ usuarios: { id: 1, nome: "Usuário", email: "user@example.test" } });
  db.usuario_empresa.findMany.mockResolvedValue([{ id_empresa: 10 }]);
});
