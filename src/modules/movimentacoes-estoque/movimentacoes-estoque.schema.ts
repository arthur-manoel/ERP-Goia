import { z } from "zod"

const id = z.number().int().positive().max(2147483647)
const decimal = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
        "Informe quantidade não negativa com até três casas decimais.",
      ),
  )
const posicao = { idProduto: id, idLocalEstoque: id, idSetor: id }
export const movimentoSchema = z.strictObject({
  ...posicao,
  quantidade: decimal.refine(
    (value) => Number(value) > 0,
    "A quantidade deve ser positiva.",
  ),
  observacao: z.string().trim().min(1).max(255),
})
export const ajusteSchema = z.strictObject({
  ...posicao,
  saldoNovo: decimal,
  saldoEsperado: decimal,
  observacao: z.string().trim().min(1).max(255),
})
const queryId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(id)
export const saldoSchema = z.strictObject({
  idProduto: queryId,
  idLocalEstoque: queryId,
})
export type MovimentoInput = z.infer<typeof movimentoSchema>
export type AjusteInput = z.infer<typeof ajusteSchema>
export type Posicao = Pick<
  MovimentoInput,
  "idProduto" | "idLocalEstoque" | "idSetor"
>
