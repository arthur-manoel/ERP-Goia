import { z } from "zod"

export const idSchema = z.number().int().positive().max(2_147_483_647)
const queryId = z
  .string()
  .regex(/^[1-9]\d*$/, "Informe um ID inteiro positivo.")
  .transform(Number)
  .pipe(idSchema)

export const produtoQuerySchema = z.object({ id_produto: queryId }).strict()

const itemSchema = z
  .object({
    id_produto_componente: idSchema,
    quantidade: z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/,
        "Use uma quantidade com até 12 dígitos inteiros e três casas decimais.",
      )
      .refine((value) => /[1-9]/.test(value), {
        message: "A quantidade deve ser maior que zero.",
      }),
  })
  .strict()

export const salvarFichaSchema = z
  .object({
    id_produto: idSchema,
    id_ficha_esperada: idSchema.nullable(),
    itens: z
      .array(itemSchema)
      .min(1, "Informe ao menos um componente.")
      .max(500),
  })
  .strict()
  .superRefine(({ id_produto, itens }, ctx) => {
    const ids = new Set<number>()
    itens.forEach((item, index) => {
      if (item.id_produto_componente === id_produto)
        ctx.addIssue({
          code: "custom",
          path: ["itens", index, "id_produto_componente"],
          message: "O produto acabado não pode ser componente de si mesmo.",
        })
      if (ids.has(item.id_produto_componente))
        ctx.addIssue({
          code: "custom",
          path: ["itens", index, "id_produto_componente"],
          message: "Cada componente pode aparecer somente uma vez.",
        })
      ids.add(item.id_produto_componente)
    })
  })

export type SalvarFichaInput = z.output<typeof salvarFichaSchema>
