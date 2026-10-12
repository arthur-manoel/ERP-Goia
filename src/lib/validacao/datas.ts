// Regra única para intervalos de datas (data inicial / data final).
// Datas no formato "aaaa-mm-dd" (valor de <input type="date">), que pode ser
// comparado como texto.

export const MENSAGEM_INTERVALO =
  "A data final deve ser igual ou posterior à data inicial."

export const MENSAGEM_INTERVALO_INCOMPLETO =
  "Preencha as duas datas do período."

/** Aceita só "aaaa-mm-dd" existente no calendário (rejeita "2026-02-31"). */
export function dataIsoValida(valor: string | null | undefined): boolean {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const data = new Date(`${valor}T00:00:00Z`)
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
  )
}

/**
 * Um intervalo é inválido somente quando as duas datas existem e a final vem
 * antes da inicial. Datas vazias (filtros abertos) não são erro por si só.
 */
export function intervaloInvertido(
  de: string | null | undefined,
  ate: string | null | undefined,
): boolean {
  return Boolean(de) && Boolean(ate) && (ate as string) < (de as string)
}

/** Mensagem de erro do intervalo, ou `null` se estiver tudo certo. */
export function erroIntervalo(
  de: string | null | undefined,
  ate: string | null | undefined,
  opcoes: { obrigatorio?: boolean; mensagem?: string } = {},
): string | null {
  if (opcoes.obrigatorio && (!de || !ate)) return MENSAGEM_INTERVALO_INCOMPLETO
  return intervaloInvertido(de, ate)
    ? (opcoes.mensagem ?? MENSAGEM_INTERVALO)
    : null
}
