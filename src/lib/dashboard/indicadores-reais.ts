import "server-only"
import { carregarPosicoesEstoque } from "@/features/estoque-minimo/queries"
import { IndicadorNaoIntegradoError } from "./erros"
import { montarIndicadorEstoque } from "./estoque"
import type {
  InsumosAbaixoDoMinimo,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "./tipos"

/*
 * Consultas REAIS da Dashboard (Prisma).
 *
 * Cada indicador permanece independente. O estoque mínimo já usa a consulta
 * real por empresa/local; os demais continuam explicitamente não integrados.
 *
 * Ao implementar cada uma:
 *  - obtenha a empresa SEMPRE de getEmpresaAtual() (lib/sessao). Estas funções
 *    não recebem idEmpresa por parâmetro de propósito;
 *  - filtre TODA consulta por idEmpresa;
 *  - devolva só o que o tipo pede, sem repassar registros inteiros do banco.
 *
 * Tabelas previstas nos placeholders das telas: estoque (insumos), ordem_producao
 * e venda (pedidos). O saldo do mês ainda não tem tabela definida.
 */

export async function consultarInsumosAbaixoDoMinimo(): Promise<InsumosAbaixoDoMinimo> {
  const { posicoes } = await carregarPosicoesEstoque()
  return montarIndicadorEstoque(posicoes)
}

export async function consultarOrdensProducaoAbertas(): Promise<OrdensProducaoAbertas> {
  throw new IndicadorNaoIntegradoError("ordens-producao-abertas")
}

export async function consultarPedidosAEntregar(): Promise<PedidosAEntregar> {
  throw new IndicadorNaoIntegradoError("pedidos-a-entregar")
}

export async function consultarSaldoDoMes(): Promise<SaldoDoMes> {
  throw new IndicadorNaoIntegradoError("saldo-do-mes")
}
