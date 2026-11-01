import "server-only"
import { entradaConclusao } from "@/modules/reservas/fluxo.service"
import * as repo from "./ordem.repository"
import {
  buscarOrdem,
  ProducaoError,
  type Ordem,
  type Contexto,
  type Transaction,
} from "./producao.repository"
const fail = (message: string): never => {
  throw new ProducaoError(409, message)
}
export async function relationships(
  ctx: Contexto,
  data: Pick<
    repo.Header,
    "id_pedido_cliente" | "id_local_estoque" | "id_setor"
  >,
  tx: Transaction,
) {
  if (!(await repo.responsible(ctx, tx)))
    throw new ProducaoError(403, "Usuário sem vínculo ativo com a empresa.")
  if (
    data.id_local_estoque &&
    !(await repo.local(ctx, data.id_local_estoque, tx))
  )
    throw new ProducaoError(
      400,
      "Local de estoque inválido ou não autorizado nesta empresa.",
    )
  if (data.id_setor && !(await repo.sector(ctx, data.id_setor, tx)))
    throw new ProducaoError(
      400,
      "Setor inválido ou não autorizado nesta empresa.",
    )
  if (data.id_pedido_cliente) {
    const pedido = await repo.pedido(ctx, data.id_pedido_cliente, tx)
    if (!pedido || pedido.status === "CANCELADO")
      throw new ProducaoError(
        400,
        "Pedido inválido ou não autorizado nesta empresa.",
      )
  }
}
export async function ready(ctx: Contexto, id: number, tx: Transaction) {
  const row = await buscarOrdem(tx, ctx, id)
  await relationships(ctx, row, tx)
  if (row.quantidade_planejada.lte(0) || !row.ordem_producao_item.length)
    fail("Informe quantidade positiva e itens antes de liberar ou iniciar.")
  if (row.ordem_producao_item.length > 200)
    fail("A ordem ultrapassa o limite operacional de 200 itens.")
  const products = [
    ...new Set(row.ordem_producao_item.map((item) => item.id_produto)),
  ]
  const materials = [
    ...new Set(
      row.ordem_producao_item.flatMap((item) =>
        item.ordem_producao_consumo_planejado.map(
          (planned) => planned.id_materia_prima,
        ),
      ),
    ),
  ]
  if (
    (await repo.activeProducts(ctx, products, true, tx)) !== products.length ||
    (await repo.activeProducts(ctx, materials, false, tx)) !== materials.length
  )
    fail("Produtos ou componentes inativos/não autorizados nesta empresa.")
  for (const item of row.ordem_producao_item) {
    if (item.quantidade.lte(0) || !item.ordem_producao_consumo_planejado.length)
      fail("Há itens sem quantidade positiva ou sem consumo planejado.")
  }
  return row
}

export async function confirmarQuantidades(
  tx: Transaction,
  ordem: Ordem,
  ctx: Contexto,
) {
  // A conclusão não fabrica apontamentos nem copia a quantidade planejada.
  if (
    !ordem.ordem_producao_item.length ||
    ordem.ordem_producao_item.some(
      (item) => !item.quantidade_produzida || item.quantidade_produzida.lte(0),
    )
  )
    throw new ProducaoError(
      409,
      "Registre a quantidade efetivamente produzida de cada item antes de concluir.",
    )
  if (
    (
      await repo.conclusionBlockers(
        { idEmpresa: ordem.id_empresa, idUsuario: ordem.id_usuario },
        ordem.id,
        tx,
      )
    ).some(Boolean)
  )
    throw new ProducaoError(
      409,
      "Há reservas, necessidades, compras ou consumos pendentes/inconsistentes. Regularize nos módulos responsáveis antes de concluir.",
    )
  if (!ordem.data_inicio || ordem.data_inicio > new Date())
    throw new ProducaoError(
      409,
      "A data de início precisa anteceder a conclusão.",
    )
  await entradaConclusao(tx, ctx, ordem.id)
}

/** Fluxo antigo não usa os estados de etapa do snapshot. */
export function validarApontamentoLegado(ordem: Ordem) {
  if (!ordem.data_inicio || ordem.data_inicio > new Date())
    fail(
      "A ordem precisa ter início efetivo válido antes de registrar produção.",
    )
  if (
    ordem.ordem_producao_movimentacao_setor.some(
      (mov) => mov.status === "EM_TRANSITO",
    )
  )
    fail("A ordem possui movimentação de setor pendente.")
  const fluxo = ordem.ordem_producao_fluxo_setor
  if (fluxo.length) {
    if (ordem.id_setor !== fluxo[fluxo.length - 1].id_setor)
      throw new ProducaoError(
        409,
        "Percorra todos os setores antes de encerrar.",
      )
    let ultimoId = 0
    for (let index = 0; index < fluxo.length; index++) {
      const movimento = ordem.ordem_producao_movimentacao_setor.find(
        (mov) =>
          mov.id > ultimoId &&
          mov.status === "ENTREGUE" &&
          mov.data_recebimento &&
          mov.id_setor_destino === fluxo[index].id_setor &&
          mov.id_setor_origem === (fluxo[index - 1]?.id_setor ?? null),
      )
      if (!movimento)
        throw new ProducaoError(
          409,
          "O histórico não comprova a passagem por todos os setores.",
        )
      ultimoId = movimento.id
    }
  }
}
