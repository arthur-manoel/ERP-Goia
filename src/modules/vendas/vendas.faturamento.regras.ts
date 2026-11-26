/**
 * Regras puras do faturamento de uma venda (sem banco), para serem testadas
 * sem Prisma. As parcelas reais de uma venda fechada a partir de um pedido
 * ficam em `contas_receber` (com os recebimentos em `pagamentos_receber`);
 * `venda_parcelas` é a tabela antiga e só é usada quando a venda não tem
 * nenhum título.
 */
type Numerico = { toString(): string } | number | string

export type TituloReceber = {
  numero_parcela: number
  total_parcelas: number
  data_vencimento: Date
  valor_final: Numerico
  situacao: "ABERTO" | "PARCIAL" | "PAGO" | "ATRASADO" | "CANCELADO"
  pagamentos_receber: { valor: Numerico }[]
}

export type ParcelaLegada = {
  numero_parcela: number
  data_vencimento: Date
  valor: Numerico
  valor_pago: Numerico
  status: "ABERTA" | "PAGA" | "PARCIAL" | "CANCELADA"
}

export type SituacaoParcela =
  "ABERTA" | "PARCIAL" | "PAGA" | "ATRASADA" | "CANCELADA"

export type ParcelaVenda = {
  origem: "TITULO" | "LEGADA"
  numero: number
  total: number
  vencimento: string // AAAA-MM-DD, sem fuso
  valor: string
  pago: string
  saldo: string
  situacao: SituacaoParcela
}

const centavos = (valor: Numerico) => Math.round(Number(valor.toString()) * 100)
const moeda = (c: number) => (c / 100).toFixed(2)
const dia = (data: Date) => data.toISOString().slice(0, 10)

const situacaoDoTitulo: Record<TituloReceber["situacao"], SituacaoParcela> = {
  ABERTO: "ABERTA",
  PARCIAL: "PARCIAL",
  PAGO: "PAGA",
  ATRASADO: "ATRASADA",
  CANCELADO: "CANCELADA",
}

function montar(
  origem: ParcelaVenda["origem"],
  numero: number,
  total: number,
  vencimento: Date,
  valorEmCentavos: number,
  pagoEmCentavos: number,
  situacao: SituacaoParcela,
): ParcelaVenda {
  const saldo =
    situacao === "CANCELADA" ? 0 : Math.max(valorEmCentavos - pagoEmCentavos, 0)
  return {
    origem,
    numero,
    total,
    vencimento: dia(vencimento),
    valor: moeda(valorEmCentavos),
    pago: moeda(pagoEmCentavos),
    saldo: moeda(saldo),
    situacao,
  }
}

/** Títulos a receber primeiro; na falta deles, as parcelas antigas. */
export function montarParcelas(
  titulos: TituloReceber[],
  legadas: ParcelaLegada[],
): ParcelaVenda[] {
  if (titulos.length)
    return titulos
      .toSorted((a, b) => a.numero_parcela - b.numero_parcela)
      .map((titulo) =>
        montar(
          "TITULO",
          titulo.numero_parcela,
          titulo.total_parcelas,
          titulo.data_vencimento,
          centavos(titulo.valor_final),
          titulo.pagamentos_receber.reduce(
            (soma, pagamento) => soma + centavos(pagamento.valor),
            0,
          ),
          situacaoDoTitulo[titulo.situacao],
        ),
      )
  const total = legadas.length
  return legadas
    .toSorted((a, b) => a.numero_parcela - b.numero_parcela)
    .map((parcela) =>
      montar(
        "LEGADA",
        parcela.numero_parcela,
        total,
        parcela.data_vencimento,
        centavos(parcela.valor),
        centavos(parcela.valor_pago),
        parcela.status,
      ),
    )
}

/** Totais das parcelas que ainda valem (canceladas ficam de fora). */
export function resumirParcelas(parcelas: ParcelaVenda[]) {
  const validas = parcelas.filter((p) => p.situacao !== "CANCELADA")
  const soma = (campo: "valor" | "pago" | "saldo") =>
    moeda(validas.reduce((total, p) => total + centavos(p[campo]), 0))
  return { valor: soma("valor"), pago: soma("pago"), saldo: soma("saldo") }
}
