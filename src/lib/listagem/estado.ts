import type {
  FiltrosListagem,
  OrdenacaoListagem,
  ResultadoPagina,
} from "./tipos"

export type EstadoListagem = "carregando" | "erro" | "vazio" | "sucesso"

/** Chave estável dos critérios de consulta; mudou = a paginação volta à página 1. */
export function chaveCriterios(
  busca: string,
  filtros: FiltrosListagem,
  ordenacao: OrdenacaoListagem | null,
  limite: number,
) {
  return JSON.stringify([
    busca,
    Object.entries(filtros).sort(([a], [b]) => a.localeCompare(b)),
    ordenacao,
    limite,
  ])
}

/** Ordenação em ciclo por coluna: crescente → decrescente → sem ordenação. */
export function proximaOrdenacao(
  atual: OrdenacaoListagem | null,
  campo: string,
): OrdenacaoListagem | null {
  if (atual?.campo !== campo) return { campo, direcao: "asc" }
  return atual.direcao === "asc" ? { campo, direcao: "desc" } : null
}

export type ConsultaConcluida<T, M> = {
  chave: string
  dados: ResultadoPagina<T, M> | null
  erro: string
}

/**
 * Estado exibido. `carregando` só aparece quando não há nada para mostrar;
 * numa recarga com dados anteriores a tabela continua visível (esmaecida).
 */
export function derivarEstado<T, M>(
  consulta: ConsultaConcluida<T, M>,
  chaveAtual: string,
): { estado: EstadoListagem; atualizando: boolean; erro: string } {
  const atual = consulta.chave === chaveAtual
  const erro = atual ? consulta.erro : ""
  const semItens = !consulta.dados || consulta.dados.itens.length === 0
  if (erro) return { estado: "erro", atualizando: false, erro }
  if (!atual && semItens)
    return { estado: "carregando", atualizando: false, erro: "" }
  if (semItens) return { estado: "vazio", atualizando: false, erro: "" }
  return { estado: "sucesso", atualizando: !atual, erro: "" }
}

/**
 * Página fora do intervalo (ex.: a última página ficou vazia após excluir o
 * último registro): devolve a página para onde voltar, ou null se está tudo certo.
 */
export function paginaCorrigida<T, M>(
  pedida: number,
  resultado: ResultadoPagina<T, M>,
): number | null {
  if (
    pedida > 1 &&
    resultado.itens.length === 0 &&
    resultado.totalPaginas < pedida
  )
    return Math.max(1, resultado.totalPaginas)
  return null
}
