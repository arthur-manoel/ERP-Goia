import { z } from "zod"

export const idSchema = z.number().int().positive().max(2147483647)
// Strings decimais preservam a precisão do contrato; números também são aceitos.
export const quantidadeSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
        "Use uma quantidade com até três casas decimais.",
      ),
  )
  .refine((value) => Number(value) > 0, "A quantidade deve ser positiva.")
export const statusSchema = z.enum([
  "PLANEJADA",
  "AGUARDANDO_MATERIAL",
  "LIBERADA",
  "EM_PRODUCAO",
  "PAUSADA",
  "CONCLUIDA",
  "CANCELADA",
])
const dataSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
const campos = {
  idProduto: idSchema,
  quantidade: quantidadeSchema,
  tamanho: z.string().trim().min(1).max(30).default("UNICO"),
  observacao: z.string().trim().max(255).nullable().optional(),
  dataPrevisao: dataSchema.nullable().optional(),
  prioridade: z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"]).optional(),
}
export const abrirSchema = z.strictObject({
  ...campos,
})
export const alterarSchema = z
  .strictObject({
    ...campos,
    idProduto: campos.idProduto.optional(),
    quantidade: campos.quantidade.optional(),
    tamanho: z.string().trim().min(1).max(30).optional(),
    statusEsperado: statusSchema,
  })
  .refine(
    (data) => Object.keys(data).some((key) => key !== "statusEsperado"),
    "Informe os dados para alteração.",
  )
export const avancarSchema = z.strictObject({
  statusEsperado: statusSchema,
  // Necessário também quando o status permanece EM_PRODUCAO entre setores.
  setorEsperado: idSchema.nullable(),
  statusDestino: z.enum([
    "AGUARDANDO_MATERIAL",
    "LIBERADA",
    "EM_PRODUCAO",
    "PAUSADA",
  ]),
})
export const encerrarSchema = z.strictObject({
  statusEsperado: z.literal("EM_PRODUCAO"),
  setorEsperado: idSchema.nullable(),
})
export type AbrirInput = z.infer<typeof abrirSchema>
export type AlterarInput = z.infer<typeof alterarSchema>
export type AvancarInput = z.infer<typeof avancarSchema>
export type EncerrarInput = z.infer<typeof encerrarSchema>
