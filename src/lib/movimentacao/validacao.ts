import {
  usaDestino,
  usaOrigem,
  type CamposMovimentacao,
  type DadosMovimentacao,
  type ErrosMovimentacao,
  type TipoMovimentacao,
} from "./tipos"

export const LIMITE_OBSERVACAO = 500

/**
 * Converte o texto digitado em decimal com ponto. Só aceita dígitos e vírgula
 * (até 3 casas, como Decimal(15, 3) no banco). Negativos, letras e ponto → null.
 */
export function interpretarQuantidade(texto: string): string | null {
  const limpo = texto.trim()
  if (!/^\d{1,12}(,\d{1,3})?$/.test(limpo)) return null
  return limpo.replace(",", ".")
}

export type ResultadoValidacao =
  | { ok: true; dados: DadosMovimentacao }
  | { ok: false; erros: ErrosMovimentacao }

/**
 * Validações de formulário (só experiência do usuário). A validação real de
 * saldo, permissão e empresa é responsabilidade do backend.
 */
export function validarMovimentacao(
  tipo: TipoMovimentacao,
  campos: CamposMovimentacao,
): ResultadoValidacao {
  const erros: ErrosMovimentacao = {}
  const { item, idEstoqueOrigem, idEstoqueDestino, observacao } = campos

  if (!item) erros.item = "Selecione um item."

  if (usaOrigem(tipo) && idEstoqueOrigem === null) {
    erros.origem = "Selecione o estoque de origem."
  }
  if (usaDestino(tipo) && idEstoqueDestino === null) {
    erros.destino = "Selecione o estoque de destino."
  }
  if (
    tipo === "transferencia" &&
    idEstoqueOrigem !== null &&
    idEstoqueOrigem === idEstoqueDestino
  ) {
    erros.destino = "O estoque de destino deve ser diferente do de origem."
  }

  const quantidade = interpretarQuantidade(campos.quantidade)
  if (campos.quantidade.trim() === "") {
    erros.quantidade = "Informe a quantidade."
  } else if (quantidade === null) {
    erros.quantidade =
      "Use apenas números positivos, com vírgula para decimais (ex.: 12,5)."
  } else if (Number(quantidade) <= 0) {
    erros.quantidade = "A quantidade deve ser maior que zero."
  }

  if (observacao.length > LIMITE_OBSERVACAO) {
    erros.observacao = `A observação pode ter no máximo ${LIMITE_OBSERVACAO} caracteres.`
  }

  if (Object.keys(erros).length > 0 || !item || quantidade === null) {
    return { ok: false, erros }
  }

  return {
    ok: true,
    dados: {
      tipo,
      idItem: item.id,
      idEstoqueOrigem: usaOrigem(tipo) ? idEstoqueOrigem : null,
      idEstoqueDestino: usaDestino(tipo) ? idEstoqueDestino : null,
      quantidade,
      observacao: observacao.trim() || null,
    },
  }
}
