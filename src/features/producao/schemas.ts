import { z } from "zod"
import { dataIso, numeroNaoNegativo, texto } from "@/features/erp/validacao"

// Uma linha da grade de produção: uma combinação de cor + tamanho (variação
// cadastrada no produto) e a quantidade planejada para essa combinação.
// Quando o produto não tem variações cadastradas, a ordem tem um único item
// sem variationId, representando a quantidade total de peças.
export const itemOrdemProducaoSchema = z.object({
  variationId: z.string().optional(),
  quantity: numeroNaoNegativo.int("Use uma quantidade inteira."),
})

export const ordemProducaoSchema = z
  .object({
    code: texto("Código"),
    productId: z.string().min(1, "Selecione um produto pronto."),
    items: z
      .array(itemOrdemProducaoSchema)
      .min(1, "Informe a quantidade de ao menos uma combinação de cor e tamanho.")
      .max(200, "Use até 200 combinações de cor e tamanho."),
    // Data de abertura: registrada automaticamente pelo sistema.
    startDate: dataIso,
    dueDate: dataIso,
    responsible: z.string().min(1, "Selecione o responsável pela produção."),
    status: z.enum(["Planejada", "Em produção", "Concluída", "Cancelada"]),
    notes: z.string().trim().max(500, "Use até 500 caracteres."),
  })
  .refine((data) => data.dueDate >= data.startDate, {
    path: ["dueDate"],
    message: "O prazo não pode ser anterior à abertura da ordem.",
  })
  .superRefine((data, ctx) => {
    if (!data.items.some((item) => item.quantity > 0))
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Informe ao menos uma quantidade maior que zero.",
      })
    const chaves = new Set<string>()
    data.items.forEach((item, index) => {
      const chave = item.variationId ?? ""
      if (chaves.has(chave))
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "quantity"],
          message: "Esta combinação de cor e tamanho está repetida.",
        })
      chaves.add(chave)
    })
  })

export type ItemOrdemProducao = z.infer<typeof itemOrdemProducaoSchema>
export type OrdemProducao = z.infer<typeof ordemProducaoSchema> & {
  id: string
}

/** Soma das quantidades de todas as combinações de cor e tamanho da ordem. */
export const totalOrdemProducao = (ordem: Pick<OrdemProducao, "items">) =>
  ordem.items.reduce((total, item) => total + item.quantity, 0)
