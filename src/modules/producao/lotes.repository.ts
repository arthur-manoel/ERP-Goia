import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { Transaction } from "./producao.repository"
import { ProducaoError } from "./producao.repository"
import { totaisDaOrdem } from "../apontamentos/apontamentos.repository"
import type { Total } from "../apontamentos/apontamentos.regras"

export async function usaLotes(tx: Transaction, id: number) {
  const rows = await tx.$queryRaw<{ id_ordem_producao: number }[]>`
    SELECT id_ordem_producao FROM producao_lote_protocolo WHERE id_ordem_producao=${id}`
  return rows.length > 0
}
export async function posicoesLote(
  tx: Transaction,
  id: number,
  substituicao?: { idItem: number; totais: Total[] },
) {
  const [itens, etapas, totais, transporte] = await Promise.all([
    tx.ordem_producao_item.findMany({
      where: { id_ordem_producao: id },
      include: { produtos: { select: { nome: true, unidade: true } } },
      orderBy: { id: "asc" },
    }),
    tx.ordem_producao_fluxo_setor.findMany({
      where: { id_ordem_producao: id },
      orderBy: { ordem: "asc" },
    }),
    totaisDaOrdem(tx, id),
    tx.$queryRaw<
      {
        id_item: number
        origem: number
        destino: number
        enviada: Prisma.Decimal
        recebida: Prisma.Decimal
      }[]
    >`
      SELECT l.id_ordem_producao_item AS id_item,r.id_etapa_origem AS origem,r.id_etapa_destino AS destino,
        SUM(l.quantidade) AS enviada, SUM(COALESCE(e.recebida,0)) AS recebida
      FROM producao_remessa r
      JOIN ordem_producao_movimentacao_item l ON l.id_movimentacao=r.id_movimentacao
      LEFT JOIN (SELECT id_linha,SUM(quantidade) AS recebida FROM producao_recebimento_item GROUP BY id_linha) e ON e.id_linha=l.id
      WHERE r.id_ordem_producao=${id} GROUP BY l.id_ordem_producao_item,r.id_etapa_origem,r.id_etapa_destino`,
  ])
  return itens.map((item) => {
    const acumulados =
      substituicao?.idItem === item.id
        ? substituicao.totais
        : totais.filter((t) => t.id_ordem_producao_item === item.id)
    const linhas = transporte.filter((t) => t.id_item === item.id)
    return {
      idItem: item.id,
      idProduto: item.id_produto,
      idCor: item.id_cor,
      idTamanho: item.id_tamanho,
      produto: item.produtos.nome,
      unidade: item.produtos.unidade,
      etapas: etapas.map((etapa, i) => {
        const total = acumulados.find((t) => t.id_setor === etapa.id_setor)
        const soma = (rows: typeof linhas, campo: "enviada" | "recebida") =>
          rows.reduce((v, t) => v.plus(t[campo]), new Prisma.Decimal(0))
        const entradas =
          i === 0
            ? item.quantidade
            : soma(
                linhas.filter((t) => t.destino === etapa.id),
                "recebida",
              )
        const saidas = linhas.filter((t) => t.origem === etapa.id)
        const produzida = new Prisma.Decimal(total?.produzida ?? 0),
          perdida = new Prisma.Decimal(total?.perdida ?? 0)
        const enviada = soma(saidas, "enviada"),
          recebidaDestino = soma(saidas, "recebida")
        if (
          produzida.plus(perdida).gt(entradas) ||
          enviada.gt(produzida) ||
          recebidaDestino.gt(enviada)
        )
          throw new ProducaoError(
            409,
            "Apontamentos e parcelas recebidas/enviadas divergem. Reconcilie o histórico.",
          )
        const aProduzir = entradas.minus(produzida).minus(perdida)
        if (
          etapa.status === "CONCLUIDA" &&
          (!aProduzir.isZero() ||
            (i < etapas.length - 1 && !produzida.eq(recebidaDestino)))
        )
          throw new ProducaoError(
            409,
            "A correção invalidaria as quantidades de uma etapa concluída.",
          )
        return {
          idEtapa: etapa.id,
          idSetor: etapa.id_setor,
          ordem: etapa.ordem,
          status: etapa.status,
          entrada: entradas.toFixed(3),
          produzida: produzida.toFixed(3),
          perdida: perdida.toFixed(3),
          aProduzir: aProduzir.toFixed(3),
          enviada: enviada.toFixed(3),
          recebidaDestino: recebidaDestino.toFixed(3),
          emTransito: enviada.minus(recebidaDestino).toFixed(3),
          disponivelEnvio: produzida.minus(enviada).toFixed(3),
          noSetor: entradas.minus(perdida).minus(enviada).toFixed(3),
        }
      }),
    }
  })
}
