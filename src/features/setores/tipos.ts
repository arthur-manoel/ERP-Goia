/** Contratos da API real de setores (`/api/setores`, `/api/tipos-setor`). */
export type SetorApi = {
  id: number
  nome: string
  tipo: string
  descricao: string | null
  ativo: boolean
  /** Linhas de `permissoes_setor` (recursos que definem o perfil de login). */
  recursos: string[]
}
export type PermissoesSetor = {
  ler: boolean
  criar: boolean
  editar: boolean
  excluir: boolean
}
/** Calculado pelo servidor; o front só o usa para mostrar ou ocultar ações. */
export type MetaSetores = {
  permissoes: PermissoesSetor
  administrador: boolean
}
export type TipoSetor = { id: number; nome: string; ativo: boolean }
export type ValoresSetor = { nome: string; tipo: string; descricao: string }
export type AlteracoesSetor = {
  nome?: string
  tipo?: string
  descricao?: string | null
}
export const TIPO_PADRAO = "Outro"
