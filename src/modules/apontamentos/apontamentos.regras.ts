import { Prisma } from "@/generated/prisma/client"
import { ProducaoError } from "@/modules/producao/producao.repository"

export type Etapa = {
  id: number
  id_setor: number
  ordem: number
  status: string
  data_inicio: Date | null
}
export type Total = {
  id_setor: number
  produzida: Prisma.Decimal
  perdida: Prisma.Decimal
}
export function diaOperacional(data: Date) {
  const partes = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data)
  const campo = (name: string) => partes.find((p) => p.type === name)!.value
  return `${campo("year")}-${campo("month")}-${campo("day")}`
}
export function validarData(data: string, inicio: Date | null, agora: Date) {
  if (
    !inicio ||
    inicio > agora ||
    data < diaOperacional(inicio) ||
    data > diaOperacional(agora)
  )
    throw new ProducaoError(
      409,
      "Data deve estar entre o início real da etapa e o dia atual no fuso operacional.",
    )
}
/** A saída válida de cada etapa é a única entrada comprovada da seguinte.
 * Ausência de registro significa zero comprovado, nunca retorno ao planejado.
 * Legados continuam consultáveis e podem ser regularizados em ordem cronológica.
 */
export function validarDisponibilidade(
  etapas: Etapa[],
  planejada: Prisma.Decimal,
  totais: Total[],
) {
  let disponivel = planejada
  return [...etapas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((etapa) => {
      const total = totais.find((t) => t.id_setor === etapa.id_setor)
      const produzida = new Prisma.Decimal(total?.produzida ?? 0)
      const perdida = new Prisma.Decimal(total?.perdida ?? 0)
      if (
        produzida.isNegative() ||
        perdida.isNegative() ||
        produzida.plus(perdida).gt(disponivel)
      )
        throw new ProducaoError(
          409,
          `Quantidade da etapa ${etapa.id} excede a disponibilidade comprovada. Regularize o histórico anterior sem presumir produção.`,
        )
      const resumo = {
        idEtapa: etapa.id,
        disponivel: disponivel.toFixed(3),
        produzida: produzida.toFixed(3),
        perdida: perdida.toFixed(3),
        restante: disponivel.minus(produzida).minus(perdida).toFixed(3),
      }
      disponivel = produzida
      return resumo
    })
}

/** Permite reconciliar legados pelo estorno das últimas etapas primeiro.
 * Um estorno pode reduzir uma inconsistência preexistente, mas jamais criar
 * nem aumentar excessos em qualquer etapa. Não concede saldo para apontar.
 */
export function validarEstornoLegado(
  etapas: Etapa[],
  planejada: Prisma.Decimal,
  antes: Total[],
  depois: Total[],
) {
  function excessos(totais: Total[]) {
    let disponivel = planejada
    return [...etapas]
      .sort((a, b) => a.ordem - b.ordem)
      .map((etapa) => {
        const total = totais.find((t) => t.id_setor === etapa.id_setor)
        const produzida = new Prisma.Decimal(total?.produzida ?? 0),
          perdida = new Prisma.Decimal(total?.perdida ?? 0)
        if (produzida.lt(0) || perdida.lt(0))
          throw new ProducaoError(409, "Totais incompatíveis com o histórico.")
        const excesso = Prisma.Decimal.max(
          0,
          produzida.plus(perdida).minus(disponivel),
        )
        disponivel = produzida
        return excesso
      })
  }
  const anteriores = excessos(antes),
    posteriores = excessos(depois)
  if (
    posteriores.some((valor, i) => valor.gt(anteriores[i])) ||
    !posteriores.some((valor, i) => valor.lt(anteriores[i]))
  )
    throw new ProducaoError(
      409,
      "Estorno incompatível com as etapas seguintes. Reconcilie as últimas etapas primeiro.",
    )
}
