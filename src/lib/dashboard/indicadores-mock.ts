import "server-only"
import type {
  InsumosAbaixoDoMinimo,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "./tipos"

/*
 * MOCKS da Dashboard: valores FICTÍCIOS, apenas para desenvolver e revisar o
 * layout. Só são chamados quando usarDadosMock() é true (nunca em produção) e a
 * tela avisa "Dados de demonstração". Os nomes de insumos e de status são
 * propositalmente genéricos ("exemplo") para não parecerem dados reais.
 * Os números são coerentes entre si (somas e totais batem), como o validador exige.
 */

// Segunda trava: se por engano este módulo for executado em produção, falha alto.
function garantirAmbienteDeDesenvolvimento() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dados mock da Dashboard não podem ser usados em produção.")
  }
}

export async function mockInsumosAbaixoDoMinimo(): Promise<InsumosAbaixoDoMinimo> {
  garantirAmbienteDeDesenvolvimento()
  return {
    total: 12,
    semEstoque: 2,
    totalMonitorados: 148,
    maisCriticos: [
      { id: 1, nome: "Insumo exemplo A", saldo: "0.000", minimo: "10.000", unidade: "un" },
      { id: 2, nome: "Insumo exemplo B", saldo: "0.000", minimo: "25.000", unidade: "m" },
      { id: 3, nome: "Insumo exemplo C", saldo: "3.500", minimo: "20.000", unidade: "kg" },
    ],
    comparativo: { rotulo: "vs. 30 dias atrás", valorAnterior: 9 },
  }
}

export async function mockOrdensProducaoAbertas(): Promise<OrdensProducaoAbertas> {
  garantirAmbienteDeDesenvolvimento()
  return {
    total: 8,
    porStatus: [
      { rotulo: "Status de exemplo A", quantidade: 4 },
      { rotulo: "Status de exemplo B", quantidade: 3 },
      { rotulo: "Status de exemplo C", quantidade: 1 },
    ],
    atrasadas: 2,
    comparativo: { rotulo: "vs. 30 dias atrás", valorAnterior: 6 },
  }
}

export async function mockPedidosAEntregar(): Promise<PedidosAEntregar> {
  garantirAmbienteDeDesenvolvimento()
  return {
    total: 15,
    atrasados: 3,
    vencemHoje: 5,
    proximos: { quantidade: 7, janelaDias: 7 },
    maiorAtrasoEmDias: 9,
    valorPendente: "48250.00",
    comparativo: { rotulo: "vs. 30 dias atrás", valorAnterior: 12 },
  }
}

export async function mockSaldoDoMes(): Promise<SaldoDoMes> {
  garantirAmbienteDeDesenvolvimento()
  return {
    valor: "24500.00",
    entradas: "61200.00",
    saidas: "36700.00",
    evolucaoDiaria: [
      "1800.00", "2600.00", "2300.00", "4100.00", "5200.00", "4800.00",
      "7300.00", "9100.00", "8600.00", "11200.00", "12900.00", "12400.00",
      "15300.00", "17800.00", "16900.00", "19700.00", "21400.00", "22800.00",
      "24500.00",
    ],
    comparativo: { rotulo: "vs. mês anterior", valorAnterior: "21800.00" },
  }
}
