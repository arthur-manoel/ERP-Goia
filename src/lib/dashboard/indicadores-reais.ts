import "server-only"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@/generated/prisma/client"
import type {
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "./tipos"

// Datas civis do ERP: DateTime do banco armazena os prazos sem fuso.
export function diaDoERP(agora = new Date()) {
  return new Date(
    `${agora.toLocaleDateString("sv-SE", { timeZone: "America/Fortaleza" })}T00:00:00Z`,
  )
}
const DIA = 86_400_000

export async function consultarOrdensProducaoAbertas(
  idEmpresa: number,
): Promise<OrdensProducaoAbertas> {
  const ordens = await prisma.ordem_producao.findMany({
    where: {
      id_empresa: idEmpresa,
      status: { notIn: ["CONCLUIDA", "CANCELADA"] },
    },
    select: { status: true, data_previsao: true },
  })
  const hoje = diaDoERP()
  const rotulos = {
    PLANEJADA: "Planejada",
    AGUARDANDO_MATERIAL: "Aguardando material",
    LIBERADA: "Liberada",
    EM_PRODUCAO: "Em produção",
    PAUSADA: "Pausada",
    CONCLUIDA: "Concluída",
    CANCELADA: "Cancelada",
  }
  const contagens = new Map<string, number>()
  for (const op of ordens)
    contagens.set(
      rotulos[op.status],
      (contagens.get(rotulos[op.status]) ?? 0) + 1,
    )
  return {
    total: ordens.length,
    atrasadas: ordens.filter(
      (op) => op.data_previsao && op.data_previsao < hoje,
    ).length,
    porStatus: [...contagens].map(([rotulo, quantidade]) => ({
      rotulo,
      quantidade,
    })),
  }
}

export async function consultarPedidosAEntregar(
  idEmpresa: number,
): Promise<PedidosAEntregar> {
  const pedidos = await prisma.pedido_cliente.findMany({
    where: {
      id_empresa: idEmpresa,
      status: {
        in: [
          "CONFIRMADO",
          "EM_PRODUCAO",
          "PRONTO",
          "EM_ENTREGA",
          "PARCIALMENTE_ENTREGUE",
        ],
      },
    },
    select: { data_previsao_entrega: true },
  })
  const hoje = diaDoERP().getTime()
  let atrasados = 0,
    vencemHoje = 0,
    proximos = 0,
    maiorAtrasoEmDias = 0
  for (const pedido of pedidos) {
    if (!pedido.data_previsao_entrega) continue
    const dias = Math.floor(
      (pedido.data_previsao_entrega.getTime() - hoje) / DIA,
    )
    if (dias < 0) {
      atrasados++
      maiorAtrasoEmDias = Math.max(maiorAtrasoEmDias, -dias)
    } else if (dias === 0) vencemHoje++
    else if (dias <= 7) proximos++
  }
  return {
    total: pedidos.length,
    atrasados,
    vencemHoje,
    proximos: { quantidade: proximos, janelaDias: 7 },
    maiorAtrasoEmDias,
  }
}

export async function consultarSaldoDoMes(
  idEmpresa: number,
): Promise<SaldoDoMes> {
  const hoje = diaDoERP()
  const inicio = new Date(`${hoje.toISOString().slice(0, 7)}-01T00:00:00-03:00`)
  const fim = new Date(
    `${new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`,
  )
  const movimentos = await prisma.movimentacoes_financeiras.groupBy({
    by: ["tipo"],
    where: {
      id_empresa: idEmpresa,
      data_movimentacao: { gte: inicio, lt: fim },
      origem: { not: "TRANSFERENCIA" },
    },
    _sum: { valor: true },
  })
  const entradas =
    movimentos.find((m) => m.tipo === "ENTRADA")?._sum.valor ??
    new Prisma.Decimal(0)
  const saidas =
    movimentos.find((m) => m.tipo === "SAIDA")?._sum.valor ??
    new Prisma.Decimal(0)
  return {
    valor: entradas.minus(saidas).toFixed(2),
    entradas: entradas.toFixed(2),
    saidas: saidas.toFixed(2),
  }
}
