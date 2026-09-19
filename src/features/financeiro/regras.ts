import type { DadosErp } from "@/features/erp/tipos"
import type { Lancamento } from "./schemas"

export function validarLancamento(
  dados: DadosErp,
  lancamento: Omit<Lancamento, "id">,
  id?: string,
) {
  const cadastro = dados.clients.find((row) => row.id === lancamento.partyId)
  if (!cadastro)
    throw new Error("Selecione um cliente ou fornecedor cadastrado.")

  if (
    lancamento.type === "Pagar"
      ? cadastro.role === "Cliente"
      : cadastro.role === "Fornecedor"
  )
    throw new Error(
      "O perfil do cadastro não corresponde ao tipo do lançamento.",
    )

  const anterior = dados.transactions.find((row) => row.id === id)
  if (cadastro.status !== "Ativo" && anterior?.partyId !== cadastro.id)
    throw new Error("Selecione um cadastro ativo para novos lançamentos.")
}

export function validarExclusaoLancamento(dados: DadosErp, id: string) {
  if (
    dados.transactions.some(
      (row) => row.id === id && row.status === "Liquidado",
    )
  )
    throw new Error("Reabra o lançamento antes de excluí-lo.")
}
