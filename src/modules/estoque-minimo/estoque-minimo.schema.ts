import { z } from "zod"

const id = z.number().int().positive().max(2147483647)

export const configurarMinimoSchema = z.strictObject({
  idProduto: id,
  idLocalEstoque: id,
  quantidadeMinima: z
    .string()
    .regex(
      /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
      "Informe uma quantidade não negativa com até três casas decimais.",
    ),
})

export type ConfigurarMinimoInput = z.infer<typeof configurarMinimoSchema>
