import { z } from "zod"
import { texto } from "@/features/erp/validacao"

/** Setor = local/etapa onde uma atividade de produção acontece. */
export const setorSchema = z.object({
  name: texto("Nome", 2),
  type: z
    .string()
    .trim()
    .max(80, "Use até 80 caracteres.")
    .optional()
    .transform((value) => (value && value.length > 0 ? value : "Outro")),
  description: z
    .string()
    .trim()
    .max(255, "Use até 255 caracteres.")
    .optional()
    .transform((value) => value ?? ""),
  status: z.enum(["Ativo", "Inativo"]),
})

export type Setor = z.infer<typeof setorSchema> & { id: string }
