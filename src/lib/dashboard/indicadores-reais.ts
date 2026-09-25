import "server-only"
import { IndicadorNaoIntegradoError } from "./erros"
import type {
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "./tipos"

/*
 * Consultas REAIS da Dashboard (Prisma).
 *
 * Estes indicadores continuam explicitamente não integrados. O estoque mínimo
 * usa a API autenticada em src/modules/estoque-minimo.
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

export async function consultarOrdensProducaoAbertas(): Promise<OrdensProducaoAbertas> {
  throw new IndicadorNaoIntegradoError("ordens-producao-abertas")
}

export async function consultarPedidosAEntregar(): Promise<PedidosAEntregar> {
  throw new IndicadorNaoIntegradoError("pedidos-a-entregar")
}

export async function consultarSaldoDoMes(): Promise<SaldoDoMes> {
  throw new IndicadorNaoIntegradoError("saldo-do-mes")
}
