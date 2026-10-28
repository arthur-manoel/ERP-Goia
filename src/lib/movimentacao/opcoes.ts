import "server-only"
import { headers } from "next/headers"
import { autorizarEstoque } from "@/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueMinimoError } from "@/modules/estoque-minimo/estoque-minimo.error"
import { estoquesMock, itensMock } from "./mock"
import type { OpcoesMovimentacao } from "./tipos"

export type ResultadoOpcoes =
  { estado: "ok"; dados: OpcoesMovimentacao } | { estado: "erro" }

/**
 * Carrega opções somente quando a requisição tem identidade e empresa
 * autorizadas pelo mesmo fluxo usado pela API de estoque.
 */
export async function obterOpcoesMovimentacao(): Promise<ResultadoOpcoes> {
  try {
    const entrada = await headers()
    const request = new Request("http://localhost/estoque/movimentacoes", {
      headers: entrada,
    })
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) return { estado: "erro" }

    // A origem ainda é mock, mas só é exposta depois de validar JWT, vínculo,
    // empresa ativa e permissão de leitura pelo autorizador já usado na API.
    return { estado: "ok", dados: { itens: itensMock, estoques: estoquesMock } }
  } catch (erro) {
    if (!(erro instanceof EstoqueMinimoError)) {
      console.error("Falha ao autorizar opções de movimentação.")
    }
    return { estado: "erro" }
  }
}
