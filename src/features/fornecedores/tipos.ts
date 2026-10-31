export type SituacaoFornecedor = "ATIVO" | "INATIVO"

/** Registro como a API /api/fornecedores devolve (colunas da tabela `fornecedores`). */
export type Fornecedor = {
  id: number
  id_empresa: number | null
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  status: string
}

/** Estado do formulário: tudo texto, como digitado. A conversão para a API fica em regras.ts. */
export type FormularioFornecedor = {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  inscricaoEstadual: string
  email: string
  telefone: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  status: SituacaoFornecedor
}

export type RespostaPaginada = {
  rows: Fornecedor[]
  count: number
  totalPages: number
}
