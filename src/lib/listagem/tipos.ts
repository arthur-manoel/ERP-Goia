/**
 * Tipos compartilhados das listagens. Não dependem de React nem de nenhum
 * módulo de negócio: cada tela informa, por uma `FonteListagem`, como buscar
 * os registros no endpoint real que ela usa.
 */

/** Valores dos filtros como texto, na chave que a API espera. Vazio = filtro não aplicado. */
export type FiltrosListagem = Record<string, string>

export type DirecaoOrdenacao = "asc" | "desc"
export type OrdenacaoListagem = { campo: string; direcao: DirecaoOrdenacao }

export type ParametrosListagem = {
  /** Começa em 1. */
  pagina: number
  limite: number
  /** Texto já aparado e com debounce aplicado pelo hook. */
  busca: string
  filtros: FiltrosListagem
  ordenacao: OrdenacaoListagem | null
}

export type ResultadoPagina<T, M = undefined> = {
  itens: T[]
  pagina: number
  limite: number
  total: number
  /** Sempre >= 1, mesmo sem registros. */
  totalPaginas: number
  /**
   * Resposta bruta do endpoint, para dados que acompanham a lista (resumos,
   * permissões). Só é preenchida quando o normalizador da tela a repassa.
   */
  meta: M
}

export type FonteListagem<T, M = undefined> = {
  buscar: (
    parametros: ParametrosListagem,
    sinal: AbortSignal,
  ) => Promise<ResultadoPagina<T, M>>
  /** Descarta caches internos; chamado por `recarregar()`. */
  invalidar?: () => void
}

/** Função que executa um GET autenticado e devolve o JSON. Falhas HTTP devem lançar `Error` com a mensagem da API. */
export type ObterJson = (url: string, sinal?: AbortSignal) => Promise<unknown>
