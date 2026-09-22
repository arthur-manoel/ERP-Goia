import { z } from "zod"

export const loginSchema = z.object({
  // Preserva o limite original antes de remover espaços do e-mail.
  email: z
    .string()
    .max(254)
    .trim()
    .pipe(z.email({ pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })),
  password: z.string().min(1).max(1024),
})

export type LoginInput = z.infer<typeof loginSchema>
