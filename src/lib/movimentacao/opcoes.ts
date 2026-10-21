import "server-only"
import { estoquesMock, itensMock } from "./mock"
import type { OpcoesMovimentacao } from "./tipos"

export type ResultadoOpcoes =
  { estado: "ok"; dados: OpcoesMovimentacao } | { estado: "erro" }

/**
 * Itens e estoques que a tela oferece nos seletores.
 *
 * MOCK: devolve dados fictícios. Ao integrar, troque o corpo desta função
 * (mantendo o retorno) por consultas restritas à empresa da sessão
 * (`getEmpresaAtual`) e apague `mock.ts`. A tela não precisa mudar.
 */
export async function obterOpcoesMovimentacao(): Promise<ResultadoOpcoes> {
  return {
    estado: "ok",
    dados: { itens: itensMock, estoques: estoquesMock },
  }
}
