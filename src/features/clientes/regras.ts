import type { DadosErp } from "@/features/erp/tipos"
import type { Cliente } from "./schemas"

export function validarCadastroCliente(
  dados: DadosErp,
  cliente: Omit<Cliente, "id">,
  id?: string,
) {
  if (
    dados.clients.some(
      (row) => row.id !== id && row.document === cliente.document,
    )
  )
    throw new Error("Este CPF ou CNPJ já está cadastrado.")

  if (
    cliente.role === "Fornecedor" &&
    dados.orders.some((row) => row.clientId === id)
  )
    throw new Error(
      "Este cadastro possui pedidos e precisa manter o perfil de cliente.",
    )

  if (
    dados.transactions.some(
      (row) =>
        row.partyId === id &&
        (row.type === "Pagar"
          ? cliente.role === "Cliente"
          : cliente.role === "Fornecedor"),
    )
  )
    throw new Error(
      "Este cadastro possui lançamentos e precisa manter o perfil correspondente.",
    )

  if (
    dados.clients.some(
      (row) =>
        row.id !== id &&
        row.email.toLowerCase() === cliente.email.toLowerCase(),
    )
  )
    throw new Error("Este e-mail já está cadastrado para outro cliente.")
}

export function validarExclusaoCliente(dados: DadosErp, id: string) {
  if (dados.transactions.some((row) => row.partyId === id))
    throw new Error(
      "Este cadastro possui lançamentos financeiros. Inative-o para preservar o histórico.",
    )
  if (dados.orders.some((row) => row.clientId === id))
    throw new Error(
      "Este cliente possui pedidos. Inative o cadastro para preservar o histórico.",
    )
}
