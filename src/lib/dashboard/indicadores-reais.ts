import "server-only"
import { IndicadorNaoIntegradoError } from "./erros"
import type {
  InsumosAbaixoDoMinimo,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "./tipos"

/*
 * Consultas REAIS da Dashboard (Prisma).
 *
 * PENDENTE DE INTEGRAÇÃO: estas funções ainda não consultam o banco. Não há
 * schema Prisma nem regra de negócio definidos para estes indicadores, e não
 * vamos inventar nomes de campos. Por isso lançam IndicadorNaoIntegradoError e a
 * tela mostra "indicador em integração" em vez de um número falso.
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
  throw new IndicadorNaoIntegradoError("insumos-abaixo-do-minimo")
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
