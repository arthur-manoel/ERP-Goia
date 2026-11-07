import { deEscala, paraEscala } from "@/modules/compras/compras.regras"
import { quantidade } from "@/modules/reservas/reservas.schema"

export const zero = BigInt(0)

export function milesimos(valor: string) {
  const negativo = valor.startsWith("-")
  const escala = paraEscala(negativo ? valor.slice(1) : valor, 3)
  if (escala === null) throw new Error("Quantidade de estoque inválida.")
  return negativo ? -escala : escala
}

export function formatarMilesimos(valor: bigint) {
  const [inteiros, fracao] = deEscala(valor < zero ? -valor : valor, 3).split(
    ".",
  )
  return `${valor < zero ? "-" : ""}${BigInt(inteiros).toLocaleString("pt-BR")},${fracao}`
}

export function quantidadeDaEntrega(entrada: FormDataEntryValue | null) {
  const texto = String(entrada ?? "")
    .trim()
    .replace(",", ".")
  if (texto === "" || /^0(?:\.0{1,3})?$/.test(texto))
    return { tipo: "omitida" } as const
  const resultado = quantidade.safeParse(texto)
  return resultado.success
    ? ({ tipo: "valida", quantidade: resultado.data } as const)
    : ({ tipo: "invalida" } as const)
}
