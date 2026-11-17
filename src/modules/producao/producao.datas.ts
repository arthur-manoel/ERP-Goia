const calendarioProducao = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

// A previsão codifica uma data civil em UTC; convertê-la de fuso recuaria
// indevidamente essa data. Já o início é um instante real no dia de São Paulo.
export function previsaoAnteriorAoDiaDeInicio(
  previsao: Date | null | undefined,
  inicio: Date | null | undefined,
) {
  if (!previsao || !inicio) return false
  const partes = calendarioProducao.formatToParts(inicio)
  const diaInicio = ["year", "month", "day"]
    .map((tipo) => partes.find((parte) => parte.type === tipo)!.value)
    .join("-")
  return previsao.toISOString().slice(0, 10) < diaInicio
}
