import "server-only"
import { z } from "zod"
import { dataCivilSchema, idSchema } from "@/modules/pedidos/pedidos.schema"

export const MAX_PARCELAS = 120

// A sequência enviada é parte do plano; não ordenamos nem derivamos vencimentos.
export const fecharSchema = z.strictObject({
  idCategoriaFinanceira: idSchema,
  vencimentos: z.array(dataCivilSchema).min(1).max(MAX_PARCELAS),
})

export type FecharInput = z.infer<typeof fecharSchema>
