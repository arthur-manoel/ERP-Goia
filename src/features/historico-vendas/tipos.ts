export type StatusVenda =
  | "RASCUNHO"
  | "CONFIRMADA"
  | "SEPARACAO"
  | "FATURADA"
  | "ENVIADA"
  | "ENTREGUE"
  | "CANCELADA"

export type StatusFinanceiro =
  | "NAO_FATURADA"
  | "PARCIALMENTE_FATURADA"
  | "FATURADA"
  | "PAGA"
  | "PARCIALMENTE_PAGA"
  | "CANCELADA"

export type SituacaoParcela =
  "ABERTA" | "PARCIAL" | "PAGA" | "ATRASADA" | "CANCELADA"

/** Item como GET /api/vendas devolve (valores monetários em texto, "12.50"). */
export type ItemVenda = {
  idProduto: number
  produto: string
  codigo: string
  variacao: string
  quantidade: string
  unitario: string
  total: string
}

/** Venda da listagem GET /api/vendas (até 200, da mais recente para a mais antiga). */
export type VendaLista = {
  id: number
  numero: string
  cliente: string | null
  pedido: string
  data: string
  status: StatusVenda
  subtotal: string
  desconto: string
  frete: string
  acrescimo: string
  total: string
  items: ItemVenda[]
}

export type Parcela = {
  origem: "TITULO" | "LEGADA"
  numero: number
  total: number
  vencimento: string
  valor: string
  pago: string
  saldo: string
  situacao: SituacaoParcela
}

export type EventoStatus = {
  id: number
  statusAnterior: StatusVenda | null
  statusNovo: StatusVenda
  observacao: string | null
  data: string
  usuario: string | null
}

/** GET /api/vendas/{id}/faturamento */
export type Faturamento = {
  id: number
  numero: string
  status: StatusVenda
  statusFinanceiro: StatusFinanceiro
  total: string
  parcelas: Parcela[]
  resumoParcelas: { valor: string; pago: string; saldo: string }
  historico: EventoStatus[]
}

export type FiltroStatus = "todos" | StatusVenda
