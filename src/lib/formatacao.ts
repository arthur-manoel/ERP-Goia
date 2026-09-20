// Formatação padrão pt-BR. Use estas funções em vez de formatar valores na mão.

/** Aceita number, string ou Prisma.Decimal (que tem toString()). */
type Numerico = number | string | { toString(): string }

const TIMEZONE = "America/Sao_Paulo"

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const data = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: TIMEZONE,
})

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: TIMEZONE,
})

function paraNumero(valor: Numerico) {
  return typeof valor === "number" ? valor : Number(valor.toString())
}

/** R$ 1.234,56 */
export function formatarMoeda(valor: Numerico) {
  return moeda.format(paraNumero(valor))
}

/** 1.234,500 (quantidades usam 3 casas no banco: Decimal(15, 3)) */
export function formatarQuantidade(valor: Numerico, casas = 3) {
  return paraNumero(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })
}

/** 18/09/2026 */
export function formatarData(valor: Date) {
  return data.format(valor)
}

/** 18/09/2026, 14:30 */
export function formatarDataHora(valor: Date) {
  return dataHora.format(valor)
}
