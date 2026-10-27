import { nomesCatalogo, normalizarCatalogo } from "@/lib/listagem/contratos"
import {
  carregarTodasPaginas,
  criarFonteLocal,
} from "@/lib/listagem/fonte-local"
import { montarQuery } from "@/lib/listagem/parametros"
import type { FonteListagem, ObterJson } from "@/lib/listagem/tipos"
import { filtrarFornecedores } from "./regras"
import type { Fornecedor } from "./tipos"

export const endpointFornecedores = "/api/fornecedores"
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

/**
 * LIMITAÇÃO DO BACKEND: GET /api/fornecedores filtra razão social e nome
 * fantasia por igualdade, não por "contém". Para manter a busca atual (razão
 * social, fantasia, CNPJ e e-mail), esta fonte carrega as páginas da empresa e
 * aplica busca e paginação no navegador. Só o filtro de situação vai ao
 * servidor. Troque por `criarFonteServidor` quando a API passar a oferecer
 * busca por "contém" com paginação.
 */
export function criarFonteFornecedores(
  obter: ObterJson,
  idEmpresa: number,
): FonteListagem<Fornecedor> {
  return criarFonteLocal<Fornecedor>({
    chaveCache: (parametros) => parametros.filtros.status ?? "",
    carregarTodos: (parametros) =>
      carregarTodasPaginas(async (pagina) => {
        const query = montarQuery(
          {
            pagina,
            limite: limiteApi,
            busca: "",
            filtros: parametros.filtros,
            ordenacao: null,
          },
          nomesCatalogo,
          { id_empresa: idEmpresa },
        )
        const resultado = normalizarCatalogo<Fornecedor>(
          await obter(`${endpointFornecedores}?${query}`),
          { pagina, limite: limiteApi },
        )
        return { itens: resultado.itens, totalPaginas: resultado.totalPaginas }
      }),
    filtrar: (itens, parametros) =>
      filtrarFornecedores(itens, parametros.busca),
  })
}
