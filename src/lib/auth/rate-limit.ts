import { createHash } from "node:crypto";
import { HttpError } from "../api/errors";
const attempts = new Map<string, { count: number; until: number }>();
// Limite por email nesta instância. Em múltiplas réplicas, usar armazenamento compartilhado.
export function limitLogin(email: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
  const entry = attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
  if (entry.count >= 10 || (!attempts.has(key) && attempts.size >= 10_000)) {
    throw new HttpError(429, "Muitas tentativas. Tente novamente em 15 minutos.");
  }
  entry.count++;
  attempts.set(key, entry);
}
