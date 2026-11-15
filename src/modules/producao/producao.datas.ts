// Datas civis da API são representadas em UTC (YYYY-MM-DD à meia-noite).
// A previsão limita o dia de início, não a hora efetiva dentro desse dia.
export function previsaoAnteriorAoDiaDeInicio(
  previsao: Date | null | undefined,
  inicio: Date | null | undefined,
) {
  return !!(
    previsao &&
    inicio &&
    previsao.toISOString().slice(0, 10) < inicio.toISOString().slice(0, 10)
  )
}
