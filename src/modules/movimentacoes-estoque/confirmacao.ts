import "server-only"
import { ConflitoTransitorio, HttpError } from "@/lib/api/errors"
import {
  chaveMovimento,
  executar,
  type Contexto,
  type Exigencia,
} from "@/modules/reservas/operacoes"
import { movimentarNaTransacao } from "./movimentacoes-estoque.repository"
import type {
  AjusteInput,
  MovimentoInput,
} from "./movimentacoes-estoque.schema"

type Confirmacao =
  | {
      confirmada: true
      movimento: Awaited<ReturnType<typeof movimentarNaTransacao>>
    }
  | { confirmada: false; status: number; mensagem: string }

class MovimentoRecusado extends Error {
  constructor(readonly recusa: HttpError) {
    super(recusa.message)
  }
}

export async function confirmarMovimento(
  ctx: Contexto,
  chave: string,
  dados: MovimentoInput | AjusteInput,
  operacao: "entrada" | "saida" | "ajuste",
) {
  const identidade = chaveMovimento("estoque-manual", chave)
  const tipo = `ESTOQUE_MANUAL_${operacao.toUpperCase()}`
  const exigencias: Exigencia[] = [
    ["ESTOQUE", "ler"],
    ["ESTOQUE", operacao === "ajuste" ? "editar" : "criar"],
  ]
  try {
    return await executar<Confirmacao>(
      ctx,
      identidade,
      tipo,
      dados,
      exigencias,
      async (tx) => {
        try {
          return {
            confirmada: true,
            movimento: await movimentarNaTransacao(tx, ctx, dados, operacao),
          }
        } catch (erro) {
          if (
            erro instanceof HttpError &&
            !(erro instanceof ConflitoTransitorio) &&
            [400, 404, 409].includes(erro.status)
          )
            throw new MovimentoRecusado(erro)
          throw erro
        }
      },
    )
  } catch (erro) {
    if (!(erro instanceof MovimentoRecusado)) throw erro
    // A transação da movimentação já reverteu todos os efeitos. Sob o mesmo
    // lock, devolve a confirmação concorrente se houve commit ou encerra a chave.
    return executar<Confirmacao>(
      ctx,
      identidade,
      tipo,
      dados,
      exigencias,
      async () => ({
        confirmada: false,
        status: erro.recusa.status,
        mensagem: erro.recusa.message,
      }),
    )
  }
}
