import type { DadosMovimentacao } from "./tipos"

export type ResultadoRegistro = { ok: true } | { ok: false; mensagem: string }

/**
 * SIMULAÇÃO: não grava nada e não chama nenhum servidor.
 *
 * Ao integrar, troque o corpo por uma Server Action/chamada real que receba
 * `DadosMovimentacao` e devolva o mesmo `ResultadoRegistro`. O backend deve
 * validar usuário autenticado, empresa atual, permissão, item, estoques,
 * quantidade, tipo e saldo disponível.
 */
export async function prepararMovimentacao(
  dados: DadosMovimentacao,
): Promise<ResultadoRegistro> {
  void dados
  await new Promise((resolver) => setTimeout(resolver, 700))
  return { ok: true }
}
