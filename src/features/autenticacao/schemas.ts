import { z } from "zod"

export const loginSchema = z.object({
  usuario: z
    .string()
    .trim()
    .min(1, "Informe o usuário.")
    .max(254, "Informe um usuário válido."),
  senha: z.string().min(1, "Informe a senha.").max(1024),
})

export type DadosLogin = z.infer<typeof loginSchema>
