import type { AlteracoesSetor, SetorApi, ValoresSetor } from "./tipos"

/**
 * Monta o PATCH com SOMENTE os campos que mudaram. `ativo` nunca entra aqui:
 * editar nome/tipo/descrição de um setor inativo não pode reenviar
 * `ativo: false` (o servidor trataria como tentativa de inativação). A
 * mudança de situação tem fluxo próprio (`alterarStatusSetor`).
 */
export function montarAlteracoes(
  original: SetorApi,
  valores: ValoresSetor,
): AlteracoesSetor {
  const alteracoes: AlteracoesSetor = {}
  const nome = valores.nome.trim()
  if (nome !== original.nome) alteracoes.nome = nome
  const descricao = valores.descricao.trim()
  if (descricao !== (original.descricao ?? ""))
    alteracoes.descricao = descricao === "" ? null : descricao
  if (valores.tipo !== original.tipo) alteracoes.tipo = valores.tipo
  return alteracoes
}
