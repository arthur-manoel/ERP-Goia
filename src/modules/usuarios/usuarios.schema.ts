import { z } from "zod"

const idSchema = z.number().int().positive().max(2147483647)
export const criarUsuarioSchema = z.strictObject({
  nome: z.string().trim().min(1).max(150),
  email: z
    .string()
    .trim()
    .max(150)
    .pipe(z.email())
    .transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(128),
  idCargo: idSchema,
  idSetor: idSchema.nullable().optional(),
})
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>
