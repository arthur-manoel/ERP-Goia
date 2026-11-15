import { z } from "zod"
import { venda_status } from "@/generated/prisma/enums"

const id = z.number().int().positive().max(2147483647)
const dinheiro = z
  .number()
  .finite()
  .min(0)
  .max(9999999999999.99)
  .transform((valor) => valor.toFixed(2))
const quantidade = z
  .number()
  .finite()
  .gt(0)
  .max(999999999999.999)
  .transform((valor) => valor.toFixed(3))
const item = z.strictObject({
  idProduto: id,
  idVariacao: id.nullable().optional().default(null),
  quantidade,
  valorUnitario: dinheiro,
})
const itens = z
  .array(item)
  .min(1)
  .max(100)
  .superRefine((linhas, ctx) => {
    const chaves = new Set<string>()
    linhas.forEach((linha, index) => {
      const chave = `${linha.idProduto}:${linha.idVariacao ?? "SEM_VARIACAO"}`
      if (chaves.has(chave))
        ctx.addIssue({
          code: "custom",
          path: [index, "idProduto"],
          message: "Não repita o mesmo produto e variação na venda.",
        })
      chaves.add(chave)
    })
  })

export const criarVendaSchema = z
  .strictObject({
    idCliente: id.nullable(),
    idPedido: id.nullable(),
    desconto: dinheiro,
    frete: dinheiro,
  })
  .extend({ itens })

export const editarVendaSchema = z
  .strictObject({
    idCliente: id.nullable().optional(),
    idPedido: id.nullable().optional(),
    desconto: dinheiro.optional(),
    frete: dinheiro.optional(),
    itens: itens.optional(),
    status: z.enum(["RASCUNHO", "CONFIRMADA", "CANCELADA"]).optional(),
  })
  .refine(
    (entrada) => Object.keys(entrada).length > 0,
    "Informe ao menos um campo.",
  )

export const idVendaSchema = z
  .string()
  .max(10)
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(id)

export const listarVendasSchema = z.strictObject({
  busca: z.string().trim().max(100).optional(),
  status: z.enum(venda_status).optional(),
})

export type CriarVenda = z.infer<typeof criarVendaSchema>
export type EditarVenda = z.infer<typeof editarVendaSchema>
export type ListarVenda = z.infer<typeof listarVendasSchema>
