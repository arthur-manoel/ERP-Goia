import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(150),
  senha: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 72,
    "Senha deve ter no máximo 72 bytes para bcrypt."),
}).strict();
export const refreshTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
