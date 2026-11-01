import { montarQuery, type NomesParametros } from "./parametros"
import type {
  FonteListagem,
  ObterJson,
  ParametrosListagem,
  ResultadoPagina,
} from "./tipos"

/** A resposta do servidor não tem o formato documentado para a listagem. */
export class RespostaInvalidaError extends Error {
  constructor(detalhe: string) {
    super(`Resposta inesperada do servidor (${detalhe}).`)
    this.name = "RespostaInvalidaError"
  }
}

type Registro = Record<string, unknown>

const ehRegistro = (valor: unknown): valor is Registro =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor)

const ehInteiroNaoNegativo = (valor: unknown): valor is number =>
  typeof valor === "number" && Number.isInteger(valor) && valor >= 0

/**
 * Contrato dos catálogos (/api/fornecedores, /api/cores, /api/tamanhos):
 * `{ success, data: { rows, count, totalPages } }`, paginado por `page`/`limit`.
 * A resposta não repete página e limite, então vêm da requisição.
 */
export function normalizarCatalogo<T>(
  corpo: unknown,
  requisicao: Pick<ParametrosListagem, "pagina" | "limite">,
): ResultadoPagina<T> {
  const data = ehRegistro(corpo) ? corpo.data : undefined
  if (!ehRegistro(data)) throw new RespostaInvalidaError("campo data ausente")
  if (!Array.isArray(data.rows))
    throw new RespostaInvalidaError("campo rows ausente")
  if (!ehInteiroNaoNegativo(data.count))
    throw new RespostaInvalidaError("campo count inválido")
  if (!ehInteiroNaoNegativo(data.totalPages))
    throw new RespostaInvalidaError("campo totalPages inválido")
  return {
    itens: data.rows as T[],
    pagina: requisicao.pagina,
    limite: requisicao.limite,
    total: data.count,
    totalPaginas: Math.max(1, data.totalPages),
    meta: undefined,
  }
}

/**
 * Contrato dos módulos clientes e compras:
 * `{ [chave]: T[], paginacao: { pagina, limite, total, totalPaginas }, ...extras }`.
 * O corpo inteiro fica em `meta` (resumo, permissões etc.).
 */
export function normalizarPaginacao<T, M = undefined>(
  corpo: unknown,
  chave: string,
): ResultadoPagina<T, M> {
  if (!ehRegistro(corpo)) throw new RespostaInvalidaError("corpo não é objeto")
  const itens = corpo[chave]
  if (!Array.isArray(itens))
    throw new RespostaInvalidaError(`campo ${chave} ausente`)
  const p = corpo.paginacao
  if (!ehRegistro(p)) throw new RespostaInvalidaError("campo paginacao ausente")
  if (
    !ehInteiroNaoNegativo(p.pagina) ||
    !ehInteiroNaoNegativo(p.limite) ||
    !ehInteiroNaoNegativo(p.total) ||
    !ehInteiroNaoNegativo(p.totalPaginas)
  )
    throw new RespostaInvalidaError("campo paginacao inválido")
  return {
    itens: itens as T[],
    pagina: p.pagina,
    limite: p.limite,
    total: p.total,
    totalPaginas: Math.max(1, p.totalPaginas),
    meta: corpo as M,
  }
}

/** Nomes de parâmetros de cada contrato. */
export const nomesCatalogo: NomesParametros = {
  pagina: "page",
  limite: "limit",
}
export const nomesPaginacao: NomesParametros = {
  pagina: "pagina",
  limite: "limite",
  busca: "busca",
}

/**
 * Fonte de dados paginada no servidor. Não cria cliente HTTP: recebe `obter`
 * (por exemplo, o `requisitar` da autenticação) e só monta a URL e valida a
 * resposta.
 */
export function criarFonteServidor<T, M = undefined>(opcoes: {
  obter: ObterJson
  rota: string
  nomes: NomesParametros
  /** Parâmetros fixos da tela (ex.: `id_empresa`). */
  extras?: Record<string, string | number | undefined>
  normalizar: (
    corpo: unknown,
    parametros: ParametrosListagem,
  ) => ResultadoPagina<T, M>
}): FonteListagem<T, M> {
  return {
    async buscar(parametros, sinal) {
      const query = montarQuery(parametros, opcoes.nomes, opcoes.extras)
      const corpo = await opcoes.obter(`${opcoes.rota}?${query}`, sinal)
      return opcoes.normalizar(corpo, parametros)
    },
  }
}

/** Texto amigável para qualquer falha de carregamento (HTTP, rede ou resposta inválida). */
export function mensagemDeErro(
  causa: unknown,
  padrao = "Não foi possível carregar a listagem.",
) {
  if (causa instanceof RespostaInvalidaError) return padrao
  if (causa instanceof TypeError)
    return "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
  return causa instanceof Error && causa.message ? causa.message : padrao
}

export const foiCancelada = (causa: unknown) =>
  causa instanceof DOMException && causa.name === "AbortError"
