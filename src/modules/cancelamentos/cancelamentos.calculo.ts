import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError } from "@/lib/api/errors"
export const fusoOperacional = "America/Sao_Paulo"
const formato = new Intl.DateTimeFormat("en-GB", {
  timeZone: fusoOperacional,
  calendar: "iso8601",
  numberingSystem: "latn",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
function civil(date: Date) {
  const p = Object.fromEntries(
    formato
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  )
  return Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
    date.getUTCMilliseconds(),
  )
}
/** Sete dias de calendário no fuso do ERP; não pressupõe sete períodos de 24 h. */
export function limiteSolicitacao(fechadoEm: Date) {
  if (!Number.isFinite(fechadoEm.getTime()))
    throw new ConflictError(
      "Data de fechamento inconsistente; análise gerencial necessária.",
    )
  const alvo = new Date(civil(fechadoEm))
  alvo.setUTCDate(alvo.getUTCDate() + 7)
  const nominal = alvo.getTime()
  const offsets = new Set(
    [-36, 0, 36].map((h) => {
      const data = new Date(nominal + h * 3600000)
      return civil(data) - data.getTime()
    }),
  )
  const candidatos = [...offsets].map((offset) => new Date(nominal - offset))
  const exatos = candidatos.filter((data) => civil(data) === nominal)
  // Em hora repetida, conserva a ocorrência final; hora inexistente avança pelo intervalo.
  if (exatos.length)
    return new Date(Math.max(...exatos.map((d) => d.getTime())))
  const posteriores = candidatos.filter((data) => civil(data) >= nominal)
  if (!posteriores.length)
    throw new ConflictError(
      "Não foi possível apurar o prazo no fuso operacional.",
    )
  return new Date(Math.min(...posteriores.map((d) => d.getTime())))
}
export function apurarPrazo(
  fechadoEm: Date | null,
  fechado: boolean,
  agora = new Date(),
) {
  const inconsistente =
    fechado &&
    (!fechadoEm || !Number.isFinite(fechadoEm.getTime()) || fechadoEm > agora)
  const limite =
    fechadoEm && !inconsistente ? limiteSolicitacao(fechadoEm) : null
  return {
    inconsistente,
    limite,
    exigeAprovacao: Boolean(
      inconsistente || (limite && agora.getTime() > limite.getTime()),
    ),
  }
}
const inteiro = (v: Prisma.Decimal, casas: number) =>
  BigInt(v.toFixed(casas).replace(".", ""))
const decimal = (v: bigint, casas = 2) =>
  new Prisma.Decimal(v.toString()).div(new Prisma.Decimal(10).pow(casas))
export type ItemRateio = {
  id: number
  quantidade: Prisma.Decimal
  valor_total: Prisma.Decimal
}
/** Centavos inteiros e maiores restos: descontos/acréscimos e frete entram no rateio completo. */
export function ratearPedido(total: Prisma.Decimal, itens: ItemRateio[]) {
  if (
    total.lt(0) ||
    total.gt("9999999999999.99") ||
    !itens.length ||
    itens.some((i) => i.quantidade.lte(0) || i.valor_total.lt(0))
  )
    throw new ConflictError("Valores do pedido incompatíveis com o estorno.")
  const soma = itens.reduce((s, i) => s + inteiro(i.valor_total, 2), BigInt(0))
  const pesos = itens.map((i) => ({
    id: i.id,
    peso: inteiro(
      soma > BigInt(0) ? i.valor_total : i.quantidade,
      soma > BigInt(0) ? 2 : 3,
    ),
  }))
  const base = pesos.reduce((s, p) => s + p.peso, BigInt(0)),
    centavos = inteiro(total, 2)
  const valores = pesos.map((p) => ({
    id: p.id,
    valor: (centavos * p.peso) / base,
    resto: (centavos * p.peso) % base,
  }))
  let sobra = centavos - valores.reduce((s, v) => s + v.valor, BigInt(0))
  for (const v of [...valores].sort((a, b) =>
    a.resto === b.resto ? a.id - b.id : a.resto > b.resto ? -1 : 1,
  )) {
    if (sobra <= BigInt(0)) break
    v.valor++
    sobra--
  }
  return new Map(valores.map((v) => [v.id, v.valor]))
}
export function creditoEntrega(
  total: Prisma.Decimal,
  itens: ItemRateio[],
  anteriores: Map<number, Prisma.Decimal>,
  atuais: Map<number, Prisma.Decimal>,
) {
  const rateio = ratearPedido(total, itens)
  const linhas = [...atuais].map(([id, quantidade]) => {
    const item = itens.find((i) => i.id === id)
    if (!item || quantidade.lte(0))
      throw new ConflictError("Item da entrega incompatível com o pedido.")
    const antes = anteriores.get(id) ?? new Prisma.Decimal(0),
      depois = antes.plus(quantidade)
    if (antes.lt(0) || depois.gt(item.quantidade))
      throw new ConflictError(
        "Quantidade estornada excede a quantidade original do item.",
      )
    const q = inteiro(item.quantidade, 3),
      valor = rateio.get(id)!
    const creditadoAntes = (valor * inteiro(antes, 3)) / q,
      creditadoDepois = (valor * inteiro(depois, 3)) / q
    return {
      idItem: id,
      quantidade: quantidade.toFixed(3),
      valor: decimal(creditadoDepois - creditadoAntes).toFixed(2),
    }
  })
  return {
    linhas,
    valor: linhas.reduce((s, l) => s.plus(l.valor), new Prisma.Decimal(0)),
  }
}
