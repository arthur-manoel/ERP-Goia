import { z } from "zod"

export const rascunhoPedidoSchema = z.object({
  idCliente: z.number().int().positive(),
  dataEntregaPrevista: z.iso.date(),
  observacao: z.string().max(2000).nullable(),
  itens: z
    .array(
      z.object({
        idProduto: z.number().int().positive(),
        idVariacao: z.number().int().positive().nullable(),
        quantidade: z
          .string()
          .regex(/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/)
          .refine((v) => /[1-9]/.test(v), "Quantidade deve ser positiva."),
        precoPraticado: z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/),
      }),
    )
    .min(1)
    .max(100),
})

export type ItemPedidoApi = {
  idItem: number
  idProduto: number
  idVariacao: number | null
  descricao: string
  quantidade: string
  precoPraticado: string
  subtotal: string
}
export type PedidoApi = {
  idPedido: number
  numero: string
  idCliente: number
  status: string
  versao: number
  dataEntregaPrevista: string | null
  observacao: string | null
  total: string
  itens: ItemPedidoApi[]
}
export type OpcoesPedidos = {
  clientes: { id: number; nome_razao_social: string }[]
  produtos: {
    id: number
    nome: string
    codigo: string
    preco: string
    temGrade: boolean
    variacoes: { id: number; cor: string; tamanho: string }[]
  }[]
}
export const statusPedidos = [
  "RASCUNHO",
  "CONFIRMADO",
  "EM_PRODUCAO",
  "PRONTO",
  "EM_ENTREGA",
  "PARCIALMENTE_ENTREGUE",
  "ENTREGUE",
  "CONCLUIDO",
  "CANCELADO",
]
export async function lerPedido<T>(resposta: Response): Promise<T> {
  const dados = await resposta.json()
  if (!resposta.ok)
    throw new Error(
      dados.error ?? "Não foi possível consultar ou salvar o pedido.",
    )
  return dados as T
}
