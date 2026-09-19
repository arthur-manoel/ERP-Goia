// Tipos da Dashboard. Sem dependências de servidor: podem ser importados em qualquer lugar.
//
// Regra do projeto para a Dashboard: SÓ o valor principal de cada indicador é
// obrigatório. Todo o resto (detalhes, distribuição, comparação) é opcional: se o
// backend ainda não fornece, o campo fica ausente e a tela simplesmente não mostra
// aquela parte. Nunca preencha um campo opcional com valor inventado.

/**
 * Resultado de um indicador. Cada indicador é carregado de forma independente,
 * então a falha (ou a falta de permissão) de um não derruba os outros.
 */
export type ResultadoIndicador<T> =
  | { estado: "ok"; dados: T }
  /** O usuário não pode ver este indicador: a tela não deve renderizá-lo. */
  | { estado: "sem_permissao" }
  /** Ainda não existe consulta real para este indicador (integração pendente). */
  | { estado: "nao_integrado" }
  /** Falha ao carregar. Os detalhes ficam só no log do servidor. */
  | { estado: "erro" }

/** Comparação de uma contagem com outro período. O texto do período vem do backend. */
export type ComparativoContagem = {
  /** Ex.: "vs. 30 dias atrás". Texto exibido ao lado da variação. */
  rotulo: string
  /** Valor do mesmo indicador no período de comparação. */
  valorAnterior: number
}

/** Comparação de um valor em reais com outro período. */
export type ComparativoMonetario = {
  /** Ex.: "vs. mês anterior". */
  rotulo: string
  /** Decimal em texto (ex.: "21800.00"). */
  valorAnterior: string
}

export type InsumoCritico = {
  id: number
  nome: string
  /** Decimais em texto (Decimal(15, 3) no banco). */
  saldo: string
  minimo: string
  /** Ex.: "m", "un", "kg". */
  unidade: string
}

export type InsumosAbaixoDoMinimo = {
  /** Insumos com saldo abaixo do estoque mínimo. */
  total: number
  /** Dentre os abaixo do mínimo, quantos estão com saldo zerado. */
  semEstoque?: number
  /** Total de insumos que têm estoque mínimo definido (base de comparação). */
  totalMonitorados?: number
  /** Os mais críticos, do pior para o menos pior. A tela mostra no máximo 3. */
  maisCriticos?: InsumoCritico[]
  comparativo?: ComparativoContagem
}

export type OrdensPorStatus = {
  /** Nome do status como o sistema o exibe. Vem do backend, não é fixo na tela. */
  rotulo: string
  quantidade: number
}

export type OrdensProducaoAbertas = {
  total: number
  /** Distribuição das abertas por status. A soma deve ser igual ao total. */
  porStatus?: OrdensPorStatus[]
  /** Abertas com prazo vencido. */
  atrasadas?: number
  comparativo?: ComparativoContagem
}

export type PedidosAEntregar = {
  total: number
  /** Prazo de entrega já vencido. */
  atrasados: number
  /** Vencem hoje. */
  vencemHoje: number
  /** Vencem depois de hoje, dentro da janela. A janela é definida pelo backend. */
  proximos: { quantidade: number; janelaDias: number }
  /** Maior atraso entre os pedidos atrasados, em dias. */
  maiorAtrasoEmDias?: number
  /** Valor total dos pedidos pendentes. Decimal em texto. */
  valorPendente?: string
  comparativo?: ComparativoContagem
}

export type SaldoDoMes = {
  /** Decimal em texto (ex.: "24500.00", "-120.50") para não perder precisão com float. */
  valor: string
  /** Total que entrou no mês. Decimal em texto. */
  entradas?: string
  /** Total que saiu no mês. Decimal em texto. */
  saidas?: string
  /**
   * Saldo acumulado ao fim de cada dia do mês, em ordem cronológica (decimais em
   * texto). Alimenta o mini-gráfico de tendência; com menos de 2 pontos ele não aparece.
   */
  evolucaoDiaria?: string[]
  comparativo?: ComparativoMonetario
}
