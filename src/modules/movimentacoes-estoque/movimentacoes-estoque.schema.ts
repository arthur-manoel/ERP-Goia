import { z } from "zod"

const mensagemId = "Informe um ID numérico inteiro e positivo válido."
const id = z
  .number({ error: mensagemId })
  .int(mensagemId)
  .positive(mensagemId)
  .max(2147483647, mensagemId)
const decimal = z
  .union([z.string(), z.number()], {
    error: "Informe uma quantidade numérica válida.",
  })
  .transform(String)
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
        "Informe quantidade não negativa com até três casas decimais.",
      ),
  )
const posicao = {
  idProduto: id,
  idLocalEstoque: id,
  idSetor: id,
  idVariacao: id.optional(),
}
const observacao = z
  .string({ error: "Informe o motivo da movimentação." })
  .trim()
  .min(1, "Informe o motivo da movimentação.")
  .max(255, "A observação deve ter no máximo 255 caracteres.")
const objeto = {
  error: "Envie somente os campos permitidos para esta operação.",
}
export const movimentoSchema = z.strictObject(
  {
    ...posicao,
    quantidade: decimal.pipe(
      z
        .string()
        .refine(
          (value) => Number(value) > 0,
          "A quantidade deve ser positiva.",
        ),
    ),
    observacao,
  },
  objeto,
)
export const ajusteSchema = z.strictObject(
  {
    ...posicao,
    saldoNovo: decimal,
    saldoEsperado: decimal,
    observacao,
  },
  objeto,
)
const queryId = z
  .string({ error: mensagemId })
  .regex(/^[1-9]\d*$/, mensagemId)
  .transform(Number)
  .pipe(id)
export const saldoSchema = z.strictObject(
  {
    idProduto: queryId,
    idLocalEstoque: queryId,
  },
  objeto,
)
export type MovimentoInput = z.infer<typeof movimentoSchema>
export type AjusteInput = z.infer<typeof ajusteSchema>
export type Posicao = Pick<
  MovimentoInput,
  "idProduto" | "idLocalEstoque" | "idSetor" | "idVariacao"
>
