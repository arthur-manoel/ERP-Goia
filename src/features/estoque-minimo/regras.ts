import type { EstadoPosicaoEstoque, PosicaoEstoque } from "./tipos"

const decimal = /^(\d+)(?:\.(\d{1,3}))?$/

export function paraMilesimos(valor: string) {
  const correspondencia = decimal.exec(valor)
  if (!correspondencia) throw new Error("Quantidade decimal inválida.")
  const inteiros = BigInt(correspondencia[1])
  const fracao = BigInt((correspondencia[2] ?? "").padEnd(3, "0"))
  return inteiros * BigInt(1000) + fracao
}

export function deMilesimos(valor: bigint) {
  const inteiros = valor / BigInt(1000)
  const fracao = (valor % BigInt(1000)).toString().padStart(3, "0")
  return `${inteiros}.${fracao}`
}

export function classificarPosicao(
  quantidade: string,
  minimo: string | null,
): EstadoPosicaoEstoque {
  if (minimo === null) return "NAO_CONFIGURADO"
  const saldo = paraMilesimos(quantidade)
  const limite = paraMilesimos(minimo)
  if (saldo === BigInt(0)) return "SEM_ESTOQUE"
  if (saldo < limite) return "ABAIXO_MINIMO"
  if (saldo === limite) return "NO_MINIMO"
  return "REGULAR"
}

export function calcularDeficit(quantidade: string, minimo: string | null) {
  if (minimo === null) return null
  const diferenca = paraMilesimos(minimo) - paraMilesimos(quantidade)
  return deMilesimos(diferenca > BigInt(0) ? diferenca : BigInt(0))
}

const prioridade: Record<EstadoPosicaoEstoque, number> = {
  SEM_ESTOQUE: 0,
  ABAIXO_MINIMO: 1,
  NO_MINIMO: 2,
  NAO_CONFIGURADO: 3,
  REGULAR: 4,
}

export function ordenarPosicoes(posicoes: PosicaoEstoque[]) {
  return posicoes.toSorted((a, b) => {
    const porEstado = prioridade[a.estado] - prioridade[b.estado]
    if (porEstado !== 0) return porEstado
    if (a.deficit !== null && b.deficit !== null) {
      const porDeficit = paraMilesimos(b.deficit) - paraMilesimos(a.deficit)
      if (porDeficit !== BigInt(0)) return porDeficit > 0 ? 1 : -1
    }
    const porProduto = a.produto.localeCompare(b.produto, "pt-BR")
    return porProduto || a.local.localeCompare(b.local, "pt-BR")
  })
}
