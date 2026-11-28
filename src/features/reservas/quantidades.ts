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

export function saldoTransferivel(
  posicao: {
    quantidade: string
    quantidade_reservada: string
    estoque_variacao: {
      id_variacao: number
      quantidade: string
      quantidade_reservada: string
    }[]
  },
  idVariacao?: number,
) {
  const detalhe = posicao.estoque_variacao.find(
    (p) => p.id_variacao === idVariacao,
  )
  const fisico =
    idVariacao === undefined
      ? posicao.estoque_variacao.reduce(
          (s, p) => s - milesimos(p.quantidade),
          milesimos(posicao.quantidade),
        )
      : milesimos(detalhe?.quantidade ?? "0")
  const reservado =
    idVariacao === undefined
      ? posicao.estoque_variacao.reduce(
          (s, p) => s - milesimos(p.quantidade_reservada),
          milesimos(posicao.quantidade_reservada),
        )
      : milesimos(detalhe?.quantidade_reservada ?? "0")
  const disponivel = fisico - reservado
  return { fisico, reservado, disponivel }
}
