/** Registro como a API /api/tipos_produto devolve (tabela `tipos_produto`). */
export type TipoProduto = {
  id: number
  nome: string
  descricao: string | null
  status: string
}

/** Estado do formulário: texto como digitado. A conversão para a API fica em regras.ts. */
export type FormularioTipoProduto = {
  nome: string
  descricao: string
}

export type RespostaPaginada = {
  rows: TipoProduto[]
  count: number
  totalPages: number
}
