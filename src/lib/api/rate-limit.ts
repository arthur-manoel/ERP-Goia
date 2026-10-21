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

function clientKey(request: Request, subject?: string) {
  if (subject !== undefined)
    return createHash("sha256").update(`subject:${subject}`).digest("hex")
  const rawAuthorization = request.headers.get("authorization") ?? ""
  const bearer = /^\s*Bearer\s+(.+?)\s*$/i.exec(rawAuthorization)
  const token = bearer?.[1]
  const authorization =
    token === undefined ? rawAuthorization.trim() : `Bearer ${token}`
  return createHash("sha256").update(authorization).digest("hex")
}

function discardExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** Limite local por processo. Para múltiplas instâncias, use uma store partilhada. */
export function enforceRateLimit(
  request: Request,
  config: RateLimit,
  subject?: string,
) {
  const now = Date.now()
  discardExpired(now)
  const key = `${config.scope}:${clientKey(request, subject)}`
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
