import { z } from "zod"
import { paraMilesimos } from "./regras"

const idPositivo = z.coerce
  .number()
  .int("Identificador inválido.")
  .positive("Identificador inválido.")

const maximo = BigInt("999999999999999")
const quantidadeValida = /^\d{1,12}(?:\.\d{1,3})?$/

export const configurarMinimoLocalSchema = z.object({
  idProduto: idPositivo,
  idLocalEstoque: idPositivo,
  quantidadeMinima: z
    .string()
    .trim()
    .transform((valor) => valor.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(
          quantidadeValida,
          "Informe uma quantidade não negativa com até três casas decimais.",
        )
        .refine(
          (valor) =>
            !quantidadeValida.test(valor) || paraMilesimos(valor) <= maximo,
          "A quantidade excede o limite suportado.",
        ),
    ),
})

export type ConfigurarMinimoLocalInput = z.infer<
  typeof configurarMinimoLocalSchema
>
