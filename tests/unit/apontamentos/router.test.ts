import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { POST } from "../../../src/app/api/ordens-producao/[id]/apontamentos/route"
const context = { params: Promise.resolve({ id: "1" }) }
it.each([
  ["{", "application/json", "12345678", 400],
  [" ".repeat(65537), "application/json", "12345678", 413],
  ["{}", "text/plain", "12345678", 415],
  ["{}", "application/json", "curta", 400],
] as const)(
  "valida corpo/tipo/chave antes de transação (caso %#)",
  async (body, type, key, status) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      {
        id_empresa: 10,
        nivel_acesso: "USUARIO",
        usuarios: { nivel_acesso: "USUARIO" },
        permissoes_usuario: [{ recurso: "ORDENS_PRODUCAO", pode_editar: true }],
      },
    ])
    const response = await POST(
      new Request("http://localhost/api/ordens-producao/1/apontamentos", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "X-Empresa-Id": "10",
          "Content-Type": type,
          "Idempotency-Key": key,
        },
        body,
      }),
      context,
    )
    expect(response.status).toBe(status)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(db.$transaction).not.toHaveBeenCalled()
  },
)
