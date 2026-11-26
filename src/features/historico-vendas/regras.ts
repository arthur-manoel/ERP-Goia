import type {
  EventoStatus,
  FiltroStatus,
  SituacaoParcela,
  StatusFinanceiro,
  StatusVenda,
  VendaLista,
} from "./tipos"

export const rotuloStatus: Record<StatusVenda, string> = {
  RASCUNHO: "Rascunho",
  CONFIRMADA: "Confirmada",
  SEPARACAO: "Em separação",
  FATURADA: "Faturada",
  ENVIADA: "Enviada",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
}

export const rotuloFinanceiro: Record<StatusFinanceiro, string> = {
  NAO_FATURADA: "Não faturada",
  PARCIALMENTE_FATURADA: "Parcialmente faturada",
  FATURADA: "Faturada",
  PAGA: "Paga",
  PARCIALMENTE_PAGA: "Parcialmente paga",
  CANCELADA: "Cancelada",
}

export const rotuloParcela: Record<SituacaoParcela, string> = {
  ABERTA: "Em aberto",
  PARCIAL: "Parcial",
  PAGA: "Paga",
  ATRASADA: "Atrasada",
  CANCELADA: "Cancelada",
}

export const opcoesStatus = Object.entries(rotuloStatus).map(
  ([valor, rotulo]) => ({ valor: valor as StatusVenda, rotulo }),
)

/** Cor do selo por status: cancelada vermelha, concluída em destaque, o resto neutro. */
export function variacaoStatus(status: StatusVenda) {
  if (status === "CANCELADA") return "destructive" as const
  if (status === "ENTREGUE" || status === "FATURADA") return "default" as const
  if (status === "RASCUNHO") return "secondary" as const
  return "outline" as const
}

export function variacaoParcela(situacao: SituacaoParcela) {
  if (situacao === "PAGA") return "default" as const
  if (situacao === "ATRASADA" || situacao === "CANCELADA")
    return "destructive" as const
  return "outline" as const
}

/** "Rascunho → Confirmada"; sem status anterior, é o registro de criação. */
export function descreverMudanca(evento: EventoStatus) {
  const novo = rotuloStatus[evento.statusNovo]
  return evento.statusAnterior
    ? `${rotuloStatus[evento.statusAnterior]} → ${novo}`
    : `Criada como ${novo}`
}

/** "2026-11-20" → "20/11/2026", sem passar por Date (evita virar o dia anterior por fuso). */
export function formatarDiaIso(dia: string) {
  const [ano, mes, diaDoMes] = dia.split("-")
  return `${diaDoMes}/${mes}/${ano}`
}

const normalizar = (valor: string) =>
  valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Busca por número, cliente, pedido ou produto, sem acento, e filtro por status. */
export function filtrarVendas(
  lista: VendaLista[],
  busca: string,
  status: FiltroStatus,
) {
  const termo = normalizar(busca.trim())
  return lista
    .filter((venda) => status === "todos" || venda.status === status)
    .filter(
      (venda) =>
        !termo ||
        normalizar(venda.numero).includes(termo) ||
        normalizar(venda.cliente ?? "").includes(termo) ||
        normalizar(venda.pedido).includes(termo) ||
        venda.items.some(
          (item) =>
            normalizar(item.produto).includes(termo) ||
            normalizar(item.codigo).includes(termo),
        ),
    )
}
