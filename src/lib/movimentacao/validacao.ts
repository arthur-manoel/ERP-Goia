import { unidadeExigeInteiro } from "../unidades"
import { LIMITES, excedeLimite, mensagemLimite } from "../validacao/texto"
import {
  usaDestino,
  usaOrigem,
  type CamposMovimentacao,
  type DadosMovimentacao,
  type ErrosMovimentacao,
  type TipoMovimentacao,
} from "./tipos"

export const LIMITE_OBSERVACAO = LIMITES.observacaoMovimentacao

/**
 * Converte o texto digitado em decimal com ponto. Só aceita dígitos e vírgula
 * (até 3 casas, como Decimal(15, 3) no banco). Negativos, letras e ponto → null.
 */
export function interpretarQuantidade(texto: string): string | null {
  const limpo = texto.trim()
  if (!/^\d{1,12}(,\d{1,3})?$/.test(limpo)) return null
  return limpo.replace(",", ".")
}

/** Tamanho máximo do texto digitado: 12 dígitos + vírgula + 3 casas. */
export const TAMANHO_MAXIMO_QUANTIDADE = 16

export const MENSAGEM_QUANTIDADE_INTEIRA = (unidade: string) =>
  `Este item é contado em ${unidade}: informe um número inteiro, sem vírgula nem casas decimais (ex.: 12).`

/**
 * Explica por que o texto digitado não é uma quantidade válida, ou devolve
 * `null` se está tudo certo. Usado ao vivo (enquanto digita/cola) e no envio.
 * `unidade` é a unidade do item selecionado (pode ser vazia antes de escolher).
 */
export function erroQuantidade(texto: string, unidade?: string): string | null {
  const limpo = texto.trim()
  if (limpo === "") return null
  if (/^-/.test(limpo)) return "A quantidade deve ser maior que zero."
  if (limpo.includes(".") && !limpo.includes(","))
    return "Use vírgula (e não ponto) para decimais, ex.: 12,5."
  if (limpo.includes(".")) return "Não use ponto como separador de milhar."
  const quantidade = interpretarQuantidade(limpo)
  if (quantidade === null) {
    if (/^\d+$/.test(limpo) && limpo.length > 12)
      return "A quantidade pode ter no máximo 12 dígitos inteiros."
    if (/^\d+,\d{4,}$/.test(limpo)) return "Use no máximo 3 casas decimais."
    return "Use apenas números positivos, com vírgula para decimais (ex.: 12,5)."
  }
  if (unidade && unidadeExigeInteiro(unidade)) {
    const [, decimais = ""] = quantidade.split(".")
    if (/[1-9]/.test(decimais)) return MENSAGEM_QUANTIDADE_INTEIRA(unidade)
  }
  return null
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

  let quantidade = interpretarQuantidade(campos.quantidade)
  if (campos.quantidade.trim() === "") {
    erros.quantidade = "Informe a quantidade."
  } else {
    const erroDigitado = erroQuantidade(campos.quantidade, item?.unidade)
    if (erroDigitado) erros.quantidade = erroDigitado
    else if (quantidade !== null && Number(quantidade) <= 0)
      erros.quantidade = "A quantidade deve ser maior que zero."
    else if (quantidade !== null && item && unidadeExigeInteiro(item.unidade))
      // "2,0" / "2,000" valem 2: normaliza para o inteiro.
      quantidade = String(Number(quantidade))
  }

  if (excedeLimite(observacao, LIMITE_OBSERVACAO)) {
    erros.observacao = mensagemLimite(LIMITE_OBSERVACAO)
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
