import "server-only"
import { autorizarEstoque } from "@/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueMinimoError } from "@/modules/estoque-minimo/estoque-minimo.error"
import { estoquesMock, itensMock } from "./mock"

/** Retorna opções depois de validar a identidade, empresa e permissão. */
export async function listarOpcoesMovimentacao(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) {
      contexto.headers.set("Cache-Control", headers["Cache-Control"])
      return contexto
    }

    // A origem ainda é mock, mas só é exposta depois de validar JWT, vínculo,
    // empresa ativa e permissão de leitura pelo autorizador já usado na API.
    return Response.json(
      { itens: itensMock, estoques: estoquesMock },
      { headers },
    )
  } catch (error) {
    if (error instanceof EstoqueMinimoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha ao carregar opções de movimentação.")
    return Response.json(
      { error: "Não foi possível carregar as opções de movimentação." },
      { status: 500, headers },
    )
  }
}
