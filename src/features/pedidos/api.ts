import { z } from "zod"

const id = z.number().int().positive().max(2147483647)
export const itemPedidoInputSchema = z.object({
  idProduto: id,
  idVariacao: id.nullable(),
  quantidade: z
    .string()
    .regex(/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/)
    .refine((v) => /[1-9]/.test(v), "Quantidade deve ser positiva."),
  precoPraticado: z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/),
})
export const rascunhoPedidoSchema = z.object({
  idCliente: id,
  dataEntregaPrevista: z.iso.date(),
  observacao: z.string().max(2000).nullable(),
  itens: z.array(itemPedidoInputSchema).min(1).max(100),
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
  const dados = await resposta.json().catch(() => {
    throw new Error(
      "O servidor retornou uma resposta inválida. Consulte novamente antes de repetir a operação.",
    )
  })
  if (!resposta.ok)
    throw new Error(
      dados.error ?? "Não foi possível consultar ou salvar o pedido.",
    )
  return dados as T
}

// Depois de uma resposta perdida, uma recusa posterior não comprova que a
// primeira criação falhou. Preserve a chave para recuperar o resultado original.
export function podeDescartarTentativa(status: number, recuperando: boolean) {
  return !recuperando && [400, 404, 409].includes(status)
}
