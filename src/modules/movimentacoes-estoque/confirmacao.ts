import "server-only"
import { ConflitoTransitorio, HttpError } from "@/lib/api/errors"
import {
  chaveMovimento,
  executar,
  type Contexto,
} from "@/modules/reservas/operacoes"
import { movimentarNaTransacao } from "./movimentacoes-estoque.repository"
import type {
  AjusteInput,
  MovimentoInput,
} from "./movimentacoes-estoque.schema"

export function confirmarMovimento(
  ctx: Contexto,
  chave: string,
  dados: MovimentoInput | AjusteInput,
  operacao: "entrada" | "saida" | "ajuste",
) {
  return executar(
    ctx,
    chaveMovimento("estoque-manual", chave),
    `ESTOQUE_MANUAL_${operacao.toUpperCase()}`,
    dados,
    [
      ["ESTOQUE", "ler"],
      ["ESTOQUE", operacao === "ajuste" ? "editar" : "criar"],
    ],
    async (tx) => {
      // A recusa encerra a chave sob o mesmo lock do replay.
      await tx.$executeRaw`SAVEPOINT estoque_manual`
      try {
        const movimento = await movimentarNaTransacao(tx, ctx, dados, operacao)
        await tx.$executeRaw`RELEASE SAVEPOINT estoque_manual`
        return { confirmada: true as const, movimento }
      } catch (erro) {
        if (
          !(erro instanceof HttpError) ||
          erro instanceof ConflitoTransitorio ||
          ![400, 404, 409].includes(erro.status)
        )
          throw erro
        // Desfaz também uma eventual abertura legada antes de persistir a recusa.
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT estoque_manual`
        await tx.$executeRaw`RELEASE SAVEPOINT estoque_manual`
        return {
          confirmada: false as const,
          status: erro.status,
          mensagem: erro.message,
        }
      }
    },
  )
}
