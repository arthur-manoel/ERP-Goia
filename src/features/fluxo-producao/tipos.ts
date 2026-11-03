/** Setor como a API /api/setores devolve. */
export type Setor = {
  id: number
  nome: string
  descricao: string | null
  ativo: boolean
}

/** Setor dentro de um fluxo: o mesmo setor mais a posição na sequência (1 = primeiro). */
export type SetorDoFluxo = Setor & { ordem: number }

/** Fluxo como a API /api/fluxos-producao devolve, com os setores já ordenados. */
export type Fluxo = {
  id: number
  nome: string
  descricao: string | null
  ativo: boolean
  setores: SetorDoFluxo[]
}

export type Paginacao = {
  pagina: number
  limite: number
  total: number
  totalPaginas: number
}

export type FiltroStatus = "todos" | "ativos" | "inativos"

/**
 * Estado do formulário. `setores` guarda só os ids, na ordem da produção
 * (a posição no array vira o campo `ordem` na API).
 */
export type FormularioFluxo = {
  nome: string
  descricao: string
  ativo: boolean
  setores: number[]
}
