import type { PosicaoEstoque } from "@/features/estoque-minimo/tipos"
import type { InsumosAbaixoDoMinimo } from "./tipos"

export function montarIndicadorEstoque(
  posicoes: PosicaoEstoque[],
): InsumosAbaixoDoMinimo {
  const alertas = posicoes.filter((posicao) =>
    ["SEM_ESTOQUE", "ABAIXO_MINIMO", "NO_MINIMO"].includes(posicao.estado),
  )
  const semMinimo = posicoes.filter(
    (posicao) => posicao.estado === "NAO_CONFIGURADO",
  ).length
  return {
    total: alertas.length,
    semEstoque: alertas.filter((posicao) => posicao.estado === "SEM_ESTOQUE")
      .length,
    semMinimo,
    totalMonitorados: posicoes.length - semMinimo,
    maisCriticos: alertas.slice(0, 3).map((posicao) => ({
      id: posicao.idEstoque,
      nome: posicao.produto,
      tipo: posicao.tipo,
      local: posicao.local,
      saldo: posicao.quantidade,
      minimo: posicao.minimo!,
      deficit: posicao.deficit!,
      estado: posicao.estado,
      unidade: posicao.unidade,
    })),
  }
}

export function textoResumoEstoque(
  dados: InsumosAbaixoDoMinimo,
): string | null {
  const semEstoque = dados.semEstoque ?? 0
  const semMinimo = dados.semMinimo ?? 0
  if (dados.total > 0) {
    return semEstoque
      ? `${semEstoque} ${semEstoque === 1 ? "posição sem estoque" : "posições sem estoque"}`
      : `${dados.total} ${dados.total === 1 ? "posição crítica" : "posições críticas"}`
  }
  if (semMinimo > 0)
    return `${semMinimo} ${semMinimo === 1 ? "posição sem mínimo local" : "posições sem mínimo local"}`
  return null
}
