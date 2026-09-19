import { z } from "zod"
import { dataIso, inteiroPositivo, texto } from "@/features/erp/validacao"

export const ordemProducaoSchema = z
  .object({
    code: texto("Código"),
    productId: z.string().min(1, "Selecione um produto pronto."),
    quantity: inteiroPositivo,
    startDate: dataIso,
    dueDate: dataIso,
    status: z.enum(["Planejada", "Em produção", "Concluída", "Cancelada"]),
    notes: z.string().trim().max(500, "Use até 500 caracteres."),
  })
  .refine((data) => data.dueDate >= data.startDate, {
    path: ["dueDate"],
    message: "A previsão não pode ser anterior ao início.",
  })

export type OrdemProducao = z.infer<typeof ordemProducaoSchema> & {
  id: string
}
