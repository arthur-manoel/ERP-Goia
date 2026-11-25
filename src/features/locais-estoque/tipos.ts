/** Registro como a API /api/locais_estoque devolve (tabela `locais_estoque`). */
export type LocalEstoque = {
  id: number
  id_empresa: number
  nome: string
  descricao: string | null
  status: "ATIVO" | "INATIVO"
}

export type FiltroStatus = "todos" | "ativos" | "inativos"

/** Estado do formulário: texto como digitado. A conversão para a API fica em regras.ts. */
export type FormularioLocal = {
  nome: string
  descricao: string
}

export type RespostaPaginada = {
  rows: LocalEstoque[]
  count: number
  totalPages: number
}
