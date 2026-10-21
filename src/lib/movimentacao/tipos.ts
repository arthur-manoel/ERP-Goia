// Tipos da tela Movimentação. Sem dependências de servidor nem de React.

export const TIPOS_MOVIMENTACAO = ["entrada", "saida", "transferencia"] as const
export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number]

export const rotuloTipo: Record<TipoMovimentacao, string> = {
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
}

/** Saída e transferência tiram do estoque de origem. */
export const usaOrigem = (tipo: TipoMovimentacao) => tipo !== "entrada"
/** Entrada e transferência colocam no estoque de destino. */
export const usaDestino = (tipo: TipoMovimentacao) => tipo !== "saida"

export type ItemMovimentavel = {
  id: number
  codigo: string
  nome: string
  /** Ex.: "un", "m", "kg". */
  unidade: string
}

export type EstoqueOpcao = {
  id: number
  nome: string
}

/** Listas que alimentam os seletores da tela (hoje mock, depois API). */
export type OpcoesMovimentacao = {
  itens: ItemMovimentavel[]
  estoques: EstoqueOpcao[]
}

/** Estado do formulário. Estoques ficam como id; o item guarda o objeto para exibir o resumo. */
export type CamposMovimentacao = {
  item: ItemMovimentavel | null
  idEstoqueOrigem: number | null
  idEstoqueDestino: number | null
  /** Texto digitado pelo usuário (ex.: "12,5"). */
  quantidade: string
  observacao: string
}

export type CampoComErro =
  "item" | "origem" | "destino" | "quantidade" | "observacao"
export type ErrosMovimentacao = Partial<Record<CampoComErro, string>>

/**
 * Dados já validados no frontend. É este formato que a integração com a API
 * deve receber depois. O backend valida tudo de novo: usuário, empresa,
 * permissão, estoques, item, saldo e isolamento entre empresas.
 */
export type DadosMovimentacao = {
  tipo: TipoMovimentacao
  idItem: number
  idEstoqueOrigem: number | null
  idEstoqueDestino: number | null
  /** Decimal em texto com ponto (ex.: "12.5"), como no resto do projeto. */
  quantidade: string
  observacao: string | null
}

/** Dados para exibir a conferência e a tela de sucesso. */
export type ResumoMovimentacaoDados = {
  tipo: TipoMovimentacao
  item: ItemMovimentavel
  origem: EstoqueOpcao | null
  destino: EstoqueOpcao | null
  quantidade: string
  observacao: string | null
}
