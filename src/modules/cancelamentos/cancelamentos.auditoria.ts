import "server-only"
import {
  auditar as registrar,
  type Tx,
  type Contexto,
} from "@/modules/reservas/operacoes"
function resumir(tabela: string, valor: unknown) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return valor
  const dados = { ...valor } as Record<string, unknown>
  if (tabela === "pedido_cancelamento") delete dados.plano_efeitos
  if (tabela === "pedido_cliente") {
    for (const campo of ["pedido_cliente_item", "_count"]) delete dados[campo]
  }
  return dados
}
/** O plano completo é preservado na solicitação; TEXT da auditoria recebe referências e estados. */
export function auditar(
  tx: Tx,
  ctx: Contexto,
  tabela: string,
  id: number,
  antes: unknown,
  depois: unknown,
) {
  return registrar(
    tx,
    ctx,
    tabela,
    id,
    resumir(tabela, antes),
    resumir(tabela, depois),
  )
}
