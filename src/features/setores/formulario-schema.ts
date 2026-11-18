import { z } from "zod"

export const formularioSetorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(100, "Use até 100 caracteres."),
  tipo: z.string().trim().min(1, "Selecione o tipo.").max(80),
  descricao: z.string().trim().max(255, "Use até 255 caracteres."),
})
