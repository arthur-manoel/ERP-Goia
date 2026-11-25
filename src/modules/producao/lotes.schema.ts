import { z } from "zod"
import { quantidade } from "@/modules/reservas/reservas.schema"
const id = z.number().int().positive().max(2147483647)
const itens = z
  .array(z.strictObject({ idItem: id, quantidade }))
  .min(1)
  .max(200)
  .refine(
    (v) => new Set(v.map((i) => i.idItem)).size === v.length,
    "Item repetido.",
  )
export const envioLote = z.strictObject({
  idEtapaOrigem: id,
  idEtapaDestino: id,
  itens,
  observacao: z.string().trim().min(1).max(255).optional(),
})
export const recebimentoLote = z.strictObject({ itens })
export type EnvioLote = z.output<typeof envioLote>
export type RecebimentoLote = z.output<typeof recebimentoLote>
