export type LinhaRelatorioProducao = {
  produto: {
    id: number
    codigo: string
    nome: string
    unidade: string
  }
  quantidadeRegistrada: string
  ordensConcluidas: number
}

export type ResultadoRelatorioProducao = {
  dados: LinhaRelatorioProducao[]
  paginacao: {
    pagina: number
    limite: number
    totalRegistros: number
    totalPaginas: number
  }
  resumo: {
    totalProdutos: number
    totalOrdensConcluidas: number
  }
}
