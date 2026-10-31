export type Produto = {
  id: number
  id_tipo_produto: number
  id_categoria: number | null
  nome: string
  codigo: string
  descricao: string | null
  unidade: string
  controla_estoque: boolean
  permite_compra: boolean
  permite_producao: boolean
  permite_venda: boolean
  status: "ATIVO" | "INATIVO"
}

export type TipoProduto = {
  id: number
  nome: string
  status: "ATIVO" | "INATIVO"
}

export type RespostaPaginada<T> = {
  rows: T[]
  count: number
  totalPages: number
}
