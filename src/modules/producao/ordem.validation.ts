import "server-only"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./ordem.repository"
import { totaisDaOrdem } from "../apontamentos/apontamentos.repository"
import {
  incluirProducaoFinalLegada,
  validarDisponibilidade,
} from "../apontamentos/apontamentos.regras"
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

export async function validarQuantidadesLegadas(tx: Transaction, ordem: Ordem) {
  const etapas = ordem.ordem_producao_fluxo_setor
  const final = etapas.at(-1)
  if (!final) return

  const totais = await totaisDaOrdem(tx, ordem.id)
  for (const item of ordem.ordem_producao_item) {
    const acumulados = totais.filter(
      (total) => total.id_ordem_producao_item === item.id,
    )
    const apontado = acumulados.find(
      (total) => total.id_setor === final.id_setor,
    )
    if (apontado && !item.quantidade_produzida.eq(apontado.produzida))
      fail(
        "Total do item diverge dos apontamentos finais. Reconcilie o histórico antes de encerrar.",
      )
    if (acumulados.some((total) => total.id_setor !== final.id_setor))
      validarDisponibilidade(
        etapas,
        item.quantidade,
        incluirProducaoFinalLegada(
          acumulados,
          final.id_setor,
          item.quantidade_produzida,
        ),
      )
  }
}

export async function confirmarQuantidades(tx: Transaction, ordem: Ordem) {
  // A conclusão não fabrica apontamentos nem copia a quantidade planejada.
  const itens = ordem.ordem_producao_item
  const semProducao = itens.filter((item) => !item.quantidade_produzida?.gt(0))
  const etapas = ordem.ordem_producao_fluxo_setor
  const acumulados =
    semProducao.length && etapas.length ? await totaisDaOrdem(tx, ordem.id) : []
  if (
    !itens.length ||
    semProducao.some((item) => {
      if (!item.quantidade_produzida?.isZero() || !item.quantidade.gt(0))
        return true
      const totais = acumulados.filter(
        (total) => total.id_ordem_producao_item === item.id,
      )
      const resumo = validarDisponibilidade(etapas, item.quantidade, totais)
      const perdas = resumo.reduce(
        (soma, etapa) => soma.plus(etapa.perdida),
        new Prisma.Decimal(0),
      )
      return resumo.at(-1)?.produzida !== "0.000" || !perdas.eq(item.quantidade)
    })
  )
    throw new ProducaoError(
      409,
      "Registre a produção efetiva ou comprove a perda integral de cada item antes de concluir.",
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
}

/** No legado, a chegada em cada setor comprova o início da etapa. */
export function inicioEtapaLegada(ordem: Ordem, setor: number): Date | null {
  const fluxo = ordem.ordem_producao_fluxo_setor
  const destino = fluxo.findIndex((etapa) => etapa.id_setor === setor)
  const atual = fluxo.findIndex((etapa) => etapa.id_setor === ordem.id_setor)
  if (!ordem.data_inicio || destino < 0 || destino > atual) return null

  let ultimoId = 0
  let inicio: Date | null = null
  for (let index = 0; index <= destino; index++) {
    const movimento = ordem.ordem_producao_movimentacao_setor.find(
      (mov) =>
        mov.id > ultimoId &&
        mov.status === "ENTREGUE" &&
        mov.data_recebimento &&
        mov.id_setor_destino === fluxo[index].id_setor &&
        mov.id_setor_origem === (fluxo[index - 1]?.id_setor ?? null),
    )
    if (!movimento) return null
    ultimoId = movimento.id
    inicio = movimento.data_recebimento
  }
  return inicio
}

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
    if (!inicioEtapaLegada(ordem, ordem.id_setor))
      fail("O histórico não comprova a passagem por todos os setores.")
  }
}
