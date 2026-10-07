export type EstadoPosicaoEstoque =
  "SEM_ESTOQUE" | "ABAIXO_MINIMO" | "NO_MINIMO" | "REGULAR" | "NAO_CONFIGURADO"

export type PosicaoEstoque = {
  idEstoque: number
  idProduto: number
  idLocalEstoque: number
  produto: string
  codigo: string
  tipo: string
  local: string
  unidade: string
  quantidade: string
  minimo: string | null
  deficit: string | null
  estado: EstadoPosicaoEstoque
  ehInsumo: boolean
}

export type ContextoEstoque = {
  idUsuario: number
  idEmpresa: number
}
