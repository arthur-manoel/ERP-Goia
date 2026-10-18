import { afterEach, expect, it, vi } from "vitest"
import { HttpError } from "../../../src/lib/api/errors"
import {
  enforceRateLimit,
  resetRateLimitsForTests,
} from "../../../src/lib/api/rate-limit"

const config = { scope: "teste-rate-limit", limit: 2, windowMs: 60_000 }
const requestFor = (authorization: string) =>
  new Request("http://localhost/api/tipos_produto", {
    headers: { Authorization: authorization },
  })

afterEach(() => {
  resetRateLimitsForTests()
  vi.useRealTimers()
})

it("conta Bearer e bearer como o mesmo token", () => {
  enforceRateLimit(requestFor("Bearer limite-de-teste"), config)
  enforceRateLimit(requestFor("bearer limite-de-teste"), config)
  expect(() =>
    enforceRateLimit(requestFor("BEARER limite-de-teste"), config),
  ).toThrow(HttpError)
})

it("não descarta contadores ativos ao atingir a capacidade", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"))
  const capacityConfig = {
    scope: "capacidade-rate-limit",
    limit: 2,
    windowMs: 60_000,
  }

  for (let index = 0; index < 5_000; index++)
    enforceRateLimit(requestFor(`Bearer cliente-${index}`), capacityConfig)

  enforceRateLimit(requestFor("Bearer cliente-0"), capacityConfig)
  expect(() =>
    enforceRateLimit(requestFor("Bearer cliente-0"), capacityConfig),
  ).toThrow(HttpError)
  expect(() =>
    enforceRateLimit(requestFor("Bearer cliente-novo"), capacityConfig),
  ).toThrow("Capacidade temporariamente esgotada")

  vi.advanceTimersByTime(60_001)
  expect(() =>
    enforceRateLimit(requestFor("Bearer cliente-novo"), capacityConfig),
  ).not.toThrow()
})
