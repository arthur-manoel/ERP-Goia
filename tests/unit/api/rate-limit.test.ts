import { expect, it } from "vitest"
import { HttpError } from "../../../src/lib/api/errors"
import { enforceRateLimit } from "../../../src/lib/api/rate-limit"

it("bloqueia o mesmo cliente ao ultrapassar o limite da janela", () => {
  const request = new Request("http://localhost/api/tipos_produto", {
    headers: { Authorization: "Bearer limite-de-teste" },
  })
  const config = { scope: "teste-rate-limit", limit: 2, windowMs: 60_000 }
  enforceRateLimit(request, config)
  enforceRateLimit(request, config)
  expect(() => enforceRateLimit(request, config)).toThrow(HttpError)
  try {
    enforceRateLimit(request, config)
  } catch (error) {
    expect((error as HttpError).status).toBe(429)
  }
})
