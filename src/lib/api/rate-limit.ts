import "server-only"
import { createHash } from "node:crypto"
import { HttpError } from "./errors"

export type RateLimit = {
  scope: string
  limit: number
  windowMs: number
}

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const maxBuckets = 5_000

function clientKey(request: Request) {
  const rawAuthorization = request.headers.get("authorization") ?? ""
  const bearer = /^\s*Bearer\s+(.+?)\s*$/i.exec(rawAuthorization)
  const token = bearer?.[1]
  const authorization =
    token === undefined ? rawAuthorization.trim() : `Bearer ${token}`
  const forwardedFor =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""
  return createHash("sha256")
    .update(`${authorization}\u0000${forwardedFor}`)
    .digest("hex")
}

function discardExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** Limite local por processo. Para múltiplas instâncias, use uma store partilhada. */
export function enforceRateLimit(request: Request, config: RateLimit) {
  const now = Date.now()
  discardExpired(now)
  const key = `${config.scope}:${clientKey(request)}`
  const current = buckets.get(key)
  if (current) {
    if (current.count >= config.limit)
      throw new HttpError(
        429,
        "Limite de requisições excedido. Tente novamente em breve.",
      )
    current.count += 1
    return
  }
  if (buckets.size >= maxBuckets)
    throw new HttpError(
      429,
      "Capacidade temporariamente esgotada. Tente novamente em breve.",
    )
  buckets.set(key, { count: 1, resetAt: now + config.windowMs })
}

/** Exclusivo para isolamento dos testes unitários. */
export function resetRateLimitsForTests() {
  buckets.clear()
}
