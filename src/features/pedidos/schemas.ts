import { z } from "zod"
import {
  dataIso,
  dinheiro,
  inteiroPositivo,
  texto,
} from "@/features/erp/validacao"

export const pedidoSchema = z
  .object({
    code: texto("Código"),
    clientId: z.string().min(1, "Selecione um cliente."),
    date: dataIso,
    dueDate: dataIso,
    status: z.enum(["Recebido", "Em produção", "Entregue", "Cancelado"]),
    items: z
      .array(
        z.object({
          productId: z.string().min(1, "Selecione um produto."),
          variationId: z.string().optional(),
          quantity: inteiroPositivo,
          price: dinheiro.refine(
            (value) => value > 0,
            "O preço deve ser maior que zero.",
          ),
        }),
      )
      .min(1, "Adicione pelo menos um item."),
  })
  .superRefine((data, ctx) => {
    if (data.dueDate < data.date)
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "A entrega não pode ser anterior ao pedido.",
      })
    const encontrados = new Set<string>()
    data.items.forEach((item, index) => {
      const chave = JSON.stringify([item.productId, item.variationId ?? ""])
      if (encontrados.has(chave))
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "productId"],
          message:
            "Produto e variação repetidos. Ajuste a quantidade do item existente.",
        })
      encontrados.add(chave)
    })
  })

export type Pedido = z.infer<typeof pedidoSchema> & { id: string }

export const totalPedido = (pedido: Pick<Pedido, "items">) =>
  pedido.items.reduce(
    (total, item) => total + Math.round(item.price * 100) * item.quantity,
    0,
  ) / 100
