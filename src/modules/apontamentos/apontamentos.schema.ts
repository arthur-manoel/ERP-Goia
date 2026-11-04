import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { dataCivil } from "@/modules/pedidos/pedidos.calculo"

export const idSchema = z.number().int().positive().max(2_147_483_647)
export const chaveSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9._:-]{8,36}$/,
    "Idempotency-Key deve conter 8 a 36 caracteres ASCII.",
  )
const quantidade = z
  .string()
  .regex(
    /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
    "Quantidade deve ser decimal não negativa, com até 12 inteiros e 3 casas decimais.",
  )
  .transform((value) => new Prisma.Decimal(value).toFixed(3))
const motivo = z
  .string()
  .trim()
  .refine(
    (value) => Array.from(value).length <= 255,
    "Motivo deve ter no máximo 255 caracteres.",
  )
const data = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000)
    return false
  const parsed = new Date(value + "T00:00:00.000Z")
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}, "Data de apontamento inválida.")
const valores = {
  quantidadeProduzida: quantidade,
  quantidadePerdida: quantidade.default("0.000"),
  motivoPerda: motivo
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  dataApontamento: data,
}
type Valores = z.output<z.ZodObject<typeof valores>>
function validarValores(value: Valores, ctx: z.RefinementCtx) {
  const perda = new Prisma.Decimal(value.quantidadePerdida)
  if (new Prisma.Decimal(value.quantidadeProduzida).plus(perda).lte(0))
    ctx.addIssue({
      code: "custom",
      path: ["quantidadeProduzida"],
      message: "Produção e perda não podem ser ambas zero.",
    })
  if (perda.gt(0) && !value.motivoPerda)
    ctx.addIssue({
      code: "custom",
      path: ["motivoPerda"],
      message: "Informe o motivo da perda.",
    })
  if (perda.eq(0) && value.motivoPerda !== null)
    ctx.addIssue({
      code: "custom",
      path: ["motivoPerda"],
      message: "Motivo deve ser null quando não houver perda.",
    })
}
export const registrarSchema = z
  .strictObject({ idEtapa: idSchema, idItem: idSchema, ...valores })
  .superRefine(validarValores)
export const corrigirSchema = z
  .strictObject({
    ...valores,
    motivoCorrecao: motivo.min(1, "Informe o motivo da correção."),
  })
  .superRefine(validarValores)
export const estornarSchema = z.strictObject({
  motivo: motivo.min(1, "Informe o motivo do estorno."),
})
export type RegistroInput = z.output<typeof registrarSchema>
export type CorrecaoInput = z.output<typeof corrigirSchema>
export type EstornoInput = z.output<typeof estornarSchema>
export const dataPersistida = (value: string) => dataCivil(value)
