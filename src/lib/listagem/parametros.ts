import type { ParametrosListagem } from "./tipos"

/** Nomes dos parâmetros de query de cada contrato de API. */
export type NomesParametros = {
  pagina: string
  limite: string
  /** Sem este nome, a busca textual não é enviada (API sem busca). */
  busca?: string
  /** Só envie se o endpoint realmente aceitar ordenação. */
  ordenarPor?: string
  direcao?: string
}

/**
 * Converte os parâmetros da listagem na query string do endpoint. Valores
 * vazios são omitidos; os filtros usam como chave o próprio nome do parâmetro
 * da API.
 */
export function montarQuery(
  parametros: ParametrosListagem,
  nomes: NomesParametros,
  extras: Record<string, string | number | undefined> = {},
) {
  const query = new URLSearchParams()
  for (const [chave, valor] of Object.entries(extras))
    if (valor !== undefined && valor !== "") query.set(chave, String(valor))
  query.set(nomes.pagina, String(parametros.pagina))
  query.set(nomes.limite, String(parametros.limite))
  const busca = parametros.busca.trim()
  if (nomes.busca && busca) query.set(nomes.busca, busca)
  for (const [chave, valor] of Object.entries(parametros.filtros))
    if (valor.trim()) query.set(chave, valor.trim())
  if (parametros.ordenacao && nomes.ordenarPor && nomes.direcao) {
    query.set(nomes.ordenarPor, parametros.ordenacao.campo)
    query.set(nomes.direcao, parametros.ordenacao.direcao)
  }
  return query
}
