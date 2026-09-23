import "server-only"
import { cache } from "react"
import { IndicadorNaoIntegradoError, SemPermissaoError } from "./erros"
import { usarDadosMock } from "./fonte"
import {
  consultarOrdensProducaoAbertas,
  consultarPedidosAEntregar,
  consultarSaldoDoMes,
} from "./indicadores-reais"
import {
  mockOrdensProducaoAbertas,
  mockPedidosAEntregar,
  mockSaldoDoMes,
} from "./indicadores-mock"
import { podeVerSaldoDoMes } from "./permissoes"
import type {
  ComparativoContagem,
  ComparativoMonetario,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  ResultadoIndicador,
  SaldoDoMes,
} from "./tipos"

/*
 * Ponto único de acesso aos indicadores da Dashboard (só servidor).
 *
 * - Escolhe entre dado real e mock (fonte.ts).
 * - Valida/normaliza o que veio da fonte: o objeto devolvido é RECONSTRUÍDO só com
 *   os campos esperados, então campos extras do banco nunca chegam à tela.
 * - Recusa dados incoerentes (ex.: soma por status diferente do total).
 * - Converte falhas em ResultadoIndicador, sem vazar detalhes técnicos.
 *
 * Nenhuma função recebe idEmpresa: a empresa vem sempre da sessão, no servidor.
 */

const MAX_PONTOS_EVOLUCAO = 31

// ---------- validadores ----------

function invalido(motivo: string): never {
  throw new Error(`Dado inválido recebido da fonte: ${motivo}.`)
}

function contagemValida(valor: number, campo: string) {
  if (!Number.isSafeInteger(valor) || valor < 0) invalido(campo)
  return valor
}

function decimalValido(valor: string, campo: string) {
  if (!/^-?\d+(\.\d+)?$/.test(valor)) invalido(campo)
  return valor
}

function textoValido(valor: string, campo: string, maximo: number) {
  const texto = valor.trim()
  if (texto.length === 0 || texto.length > maximo) invalido(campo)
  return texto
}

function opcional<E, S>(valor: E | undefined, validar: (v: E) => S) {
  return valor === undefined ? undefined : validar(valor)
}

function comparativoContagem(c: ComparativoContagem): ComparativoContagem {
  return {
    rotulo: textoValido(c.rotulo, "comparativo.rotulo", 40),
    valorAnterior: contagemValida(c.valorAnterior, "comparativo.valorAnterior"),
  }
}

function comparativoMonetario(c: ComparativoMonetario): ComparativoMonetario {
  return {
    rotulo: textoValido(c.rotulo, "comparativo.rotulo", 40),
    valorAnterior: decimalValido(c.valorAnterior, "comparativo.valorAnterior"),
  }
}

// ---------- carregamento com tratamento de erro ----------

async function carregar<T>(
  indicador: string,
  buscar: () => Promise<T>,
): Promise<ResultadoIndicador<T>> {
  try {
    return { estado: "ok", dados: await buscar() }
  } catch (erro) {
    if (erro instanceof IndicadorNaoIntegradoError) {
      return { estado: "nao_integrado" }
    }
    if (erro instanceof SemPermissaoError) return { estado: "sem_permissao" }
    // O detalhe fica só no log do servidor; o usuário recebe uma mensagem genérica.
    console.error(`[dashboard] Falha ao carregar "${indicador}".`, erro)
    return { estado: "erro" }
  }
}

// ---------- indicadores ----------
// Cada um usa cache() do React: na mesma requisição, o card e o resumo de atenção
// compartilham UMA consulta em vez de repetir.

export const obterOrdensProducaoAbertas = cache(() => {
  return carregar("ordens-producao-abertas", async () => {
    const bruto: OrdensProducaoAbertas = usarDadosMock()
      ? await mockOrdensProducaoAbertas()
      : await consultarOrdensProducaoAbertas()

    const total = contagemValida(bruto.total, "total")
    const atrasadas = opcional(bruto.atrasadas, (v) =>
      contagemValida(v, "atrasadas"),
    )
    if (atrasadas !== undefined && atrasadas > total) {
      invalido("atrasadas maior que o total")
    }
    const porStatus = opcional(bruto.porStatus, (lista) =>
      lista.map((s) => ({
        rotulo: textoValido(s.rotulo, "status.rotulo", 40),
        quantidade: contagemValida(s.quantidade, "status.quantidade"),
      })),
    )
    if (
      porStatus !== undefined &&
      porStatus.reduce((soma, s) => soma + s.quantidade, 0) !== total
    ) {
      invalido("soma por status diferente do total")
    }

    const dados: OrdensProducaoAbertas = {
      total,
      porStatus,
      atrasadas,
      comparativo: opcional(bruto.comparativo, comparativoContagem),
    }
    return dados
  })
})

export const obterPedidosAEntregar = cache(() => {
  return carregar("pedidos-a-entregar", async () => {
    const bruto: PedidosAEntregar = usarDadosMock()
      ? await mockPedidosAEntregar()
      : await consultarPedidosAEntregar()

    const total = contagemValida(bruto.total, "total")
    const atrasados = contagemValida(bruto.atrasados, "atrasados")
    const vencemHoje = contagemValida(bruto.vencemHoje, "vencemHoje")
    const quantidadeProximos = contagemValida(
      bruto.proximos.quantidade,
      "proximos.quantidade",
    )
    const janelaDias = contagemValida(bruto.proximos.janelaDias, "janelaDias")
    if (janelaDias < 1 || janelaDias > 365)
      invalido("janelaDias fora do limite")
    if (atrasados + vencemHoje + quantidadeProximos > total) {
      invalido("contagens de pedidos maiores que o total")
    }
    const maiorAtrasoEmDias = opcional(bruto.maiorAtrasoEmDias, (v) =>
      contagemValida(v, "maiorAtrasoEmDias"),
    )
    if (
      maiorAtrasoEmDias !== undefined &&
      maiorAtrasoEmDias > 0 &&
      atrasados === 0
    ) {
      invalido("maior atraso sem pedidos atrasados")
    }

    const dados: PedidosAEntregar = {
      total,
      atrasados,
      vencemHoje,
      proximos: { quantidade: quantidadeProximos, janelaDias },
      maiorAtrasoEmDias,
      valorPendente: opcional(bruto.valorPendente, (v) =>
        decimalValido(v, "valorPendente"),
      ),
      comparativo: opcional(bruto.comparativo, comparativoContagem),
    }
    return dados
  })
})

export const obterSaldoDoMes = cache(() => {
  return carregar("saldo-do-mes", async () => {
    // A checagem de permissão vive aqui, no servidor, antes de tocar nos dados.
    if (!(await podeVerSaldoDoMes())) throw new SemPermissaoError()

    const bruto: SaldoDoMes = usarDadosMock()
      ? await mockSaldoDoMes()
      : await consultarSaldoDoMes()

    const dados: SaldoDoMes = {
      valor: decimalValido(bruto.valor, "valor"),
      entradas: opcional(bruto.entradas, (v) => decimalValido(v, "entradas")),
      saidas: opcional(bruto.saidas, (v) => decimalValido(v, "saidas")),
      evolucaoDiaria: opcional(bruto.evolucaoDiaria, (lista) =>
        lista
          .slice(0, MAX_PONTOS_EVOLUCAO)
          .map((v) => decimalValido(v, "evolucaoDiaria")),
      ),
      comparativo: opcional(bruto.comparativo, comparativoMonetario),
    }
    return dados
  })
})
