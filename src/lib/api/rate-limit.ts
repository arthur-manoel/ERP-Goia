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
  const authorization = request.headers.get("authorization") ?? ""
  const forwardedFor =
    request.headers.get("x-forwarded-for")?.split(",")[0] ?? ""
  return createHash("sha256")
    .update(`${authorization}\u0000${forwardedFor}`)
    .digest("hex")
}

function discardExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
  if (buckets.size >= maxBuckets) buckets.delete(buckets.keys().next().value)
}

/** Limite local por processo. Para múltiplas instâncias, use uma store partilhada. */
export function enforceRateLimit(request: Request, config: RateLimit) {
  const now = Date.now()
  discardExpired(now)
  const key = `${config.scope}:${clientKey(request)}`
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs })
    return
  }
  if (current.count >= config.limit)
    throw new HttpError(
      429,
      "Limite de requisições excedido. Tente novamente em breve.",
    )
  current.count += 1
}
