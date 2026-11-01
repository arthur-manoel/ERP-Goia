import type { FonteListagem, ParametrosListagem } from "./tipos"

/**
 * Percorre todas as páginas de um endpoint paginado. Só deve ser usada quando
 * o endpoint não oferece o recurso necessário no servidor (ex.: busca por
 * "contém") e o volume de dados é pequeno. O limite de páginas evita laço
 * infinito diante de uma resposta inconsistente.
 */
export async function carregarTodasPaginas<T>(
  buscarPagina: (
    pagina: number,
  ) => Promise<{ itens: T[]; totalPaginas: number }>,
  maximoPaginas = 200,
): Promise<T[]> {
  const todos: T[] = []
  let pagina = 1
  let totalPaginas = 1
  do {
    const resultado = await buscarPagina(pagina)
    todos.push(...resultado.itens)
    totalPaginas = resultado.totalPaginas
    if (totalPaginas > maximoPaginas)
      throw new Error(
        "Há registros demais para listar com busca local. Refine os filtros.",
      )
    pagina += 1
  } while (pagina <= totalPaginas)
  return todos
}

/**
 * Fonte que carrega o conjunto uma vez e aplica busca e paginação no
 * navegador. É o recurso de contingência para endpoints sem busca "contém" ou
 * sem paginação; deve ser substituída por `criarFonteServidor` quando o
 * backend passar a oferecer o recurso.
 *
 * O cache vale por `chaveCache` (filtros enviados ao servidor) até `invalidar()`.
 */
export function criarFonteLocal<T>(opcoes: {
  carregarTodos: (parametros: ParametrosListagem) => Promise<T[]>
  /** Identifica os parâmetros que alteram o que o servidor devolve. */
  chaveCache?: (parametros: ParametrosListagem) => string
  filtrar?: (itens: T[], parametros: ParametrosListagem) => T[]
}): FonteListagem<T> {
  const cache = new Map<string, Promise<T[]>>()
  return {
    async buscar(parametros) {
      const chave = opcoes.chaveCache?.(parametros) ?? ""
      let carga = cache.get(chave)
      if (!carga) {
        carga = opcoes.carregarTodos(parametros)
        cache.set(chave, carga)
        // Falha não fica em cache: a próxima tentativa consulta de novo.
        carga.catch(() => {
          if (cache.get(chave) === carga) cache.delete(chave)
        })
      }
      const todos = await carga
      const filtrados = opcoes.filtrar
        ? opcoes.filtrar(todos, parametros)
        : todos
      const inicio = (parametros.pagina - 1) * parametros.limite
      return {
        itens: filtrados.slice(inicio, inicio + parametros.limite),
        pagina: parametros.pagina,
        limite: parametros.limite,
        total: filtrados.length,
        totalPaginas: Math.max(
          1,
          Math.ceil(filtrados.length / parametros.limite),
        ),
        meta: undefined,
      }
    },
    invalidar() {
      cache.clear()
    },
  }
}
