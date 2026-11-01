import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { z } from "zod"
import * as repo from "./ordem.repository"
import {
  relationships,
  ready,
  validarApontamentoLegado,
} from "./ordem.validation"
import {
  auditar,
  buscarOrdem,
  produtoComFicha,
  ProducaoError,
  type Contexto,
  type Transaction,
} from "./producao.repository"
import {
  calcularInsumos,
  avancarOrdemNaTransacao,
  encerrarOrdemNaTransacao,
  executarEtapaNaTransacao,
} from "./producao.service"
import * as fluxos from "../fluxos/fluxos.repository"
import { validarFluxo } from "../fluxos/fluxos.service"
import type {
  OrdemInput,
  OrdemFilters,
  Pagination,
  ordemItemSchema,
  apontarSchema,
  patchItemSchema,
} from "./ordem.schema"

const conflict = (message: string): never => {
  throw new ProducaoError(409, message)
}
function company(ctx: Contexto, id?: number) {
  if (id !== undefined && id !== ctx.idEmpresa)
    throw new ProducaoError(403, "Acesso negado à empresa.")
}
async function required(ctx: Contexto, id: number, tx?: Transaction) {
  const row = tx ? await repo.lock(ctx, id, tx) : await repo.findById(ctx, id)
  if (!row) throw new ProducaoError(404, "Ordem de produção não encontrada.")
  return row
}

function dates(data: Pick<repo.Header, "data_inicio" | "data_previsao">) {
  if (
    data.data_inicio &&
    data.data_previsao &&
    data.data_previsao < data.data_inicio
  )
    throw new ProducaoError(400, "A previsão não pode ser anterior ao início.")
}
async function unique(
  ctx: Contexto,
  numero: string,
  tx: Transaction,
  id?: number,
) {
  const found = await repo.findByNumero(ctx, numero, tx)
  if (found && found.id !== id)
    conflict("Já existe uma ordem com este número nesta empresa.")
}
const pageResult = <T>(
  result: { rows: T[]; count: number },
  pagination: Pagination,
) => ({
  ...result,
  ...pagination,
  totalPages: Math.ceil(result.count / pagination.limit),
})
export async function findAll(
  ctx: Contexto,
  filters: OrdemFilters,
  pagination: Pagination,
) {
  company(ctx, filters.id_empresa)
  return pageResult(await repo.findAll(ctx, filters, pagination), pagination)
}
export function findById(ctx: Contexto, id: number) {
  return required(ctx, id)
}
export function create(ctx: Contexto, input: OrdemInput) {
  company(ctx, input.id_empresa)
  return repo.write(ctx, async (tx) => {
    const { id_empresa, ...data } = input
    company(ctx, id_empresa)
    await relationships(ctx, data, tx)
    dates(data)
    await unique(ctx, data.numero, tx)
    const row = await repo.create(ctx, { ...data, status: "PLANEJADA" }, tx)
    await auditar(tx, ctx, null, row)
    return row
  })
}
export function update(
  ctx: Contexto,
  id: number,
  input: Partial<Omit<OrdemInput, "id_empresa">>,
) {
  return repo.write(ctx, async (tx) => {
    const before = await required(ctx, id, tx)
    if (["CONCLUIDA", "CANCELADA"].includes(before.status))
      conflict("Ordens encerradas não podem ser editadas.")
    if (
      before.status !== "PLANEJADA" &&
      Object.keys(input).some(
        (field) => !["observacao", "data_previsao"].includes(field),
      )
    )
      conflict(
        "Fora de PLANEJADA, somente observação e previsão podem ser alteradas.",
      )
    if (
      Object.keys(input).some(
        (field) => !["observacao", "data_previsao"].includes(field),
      ) &&
      (await repo.operationalCounts(ctx, id, tx)).some(Boolean)
    )
      conflict(
        "Há efeitos operacionais que impedem a alteração do planejamento.",
      )
    const data = { ...before, ...input }
    dates(data)
    await relationships(ctx, data, tx)
    if (input.numero !== undefined) await unique(ctx, input.numero, tx, id)
    // O cabeçalho não redistribui quantidades entre itens: isso alteraria os consumos previstos.
    if (
      input.quantidade_planejada !== undefined &&
      !before.quantidade_planejada.eq(input.quantidade_planejada) &&
      before._count.ordem_producao_item
    ) {
      const order = await buscarOrdem(tx, ctx, id)
      // O fluxo existente sincroniza um único item. Com vários itens, a meta
      // geral não redistribui quantidades; cada item tem seu próprio planejamento.
      if (
        order.ordem_producao_item.length === 1 &&
        new Prisma.Decimal(input.quantidade_planejada).gt(0)
      ) {
        const item = order.ordem_producao_item[0]
        const ficha = await produtoComFicha(tx, ctx, item.id_produto)
        await repo.deletePlan(ctx, id, item.id, tx)
        await repo.createPlan(
          ctx,
          id,
          item.id,
          calcularInsumos(input.quantidade_planejada, ficha.ficha_tecnica_item),
          tx,
        )
        await repo.updateItem(
          ctx,
          id,
          item.id,
          { quantidade: input.quantidade_planejada },
          tx,
        )
      }
    }
    await repo.update(ctx, id, input, tx)
    const after = await required(ctx, id, tx)
    await auditar(tx, ctx, before, after)
    return after
  })
}
export const patch = update
export function cancel(ctx: Contexto, id: number) {
  return repo.write(ctx, async (tx) => {
    const before = await required(ctx, id, tx)
    if (["CONCLUIDA", "CANCELADA"].includes(before.status))
      conflict("Não é permitido cancelar ordens concluídas ou já canceladas.")
    const effects = await repo.operationalCounts(ctx, id, tx)
    const reasons = [
      "reservas ativas",
      "consumos",
      "movimentações de estoque",
      "compras ativas",
      "pedidos de compra ativos",
      "necessidades de produção",
      "movimentações entre setores",
      "apontamentos de produção",
      "obrigações financeiras",
      "quantidades produzidas registradas",
    ]
    const blocked = reasons.filter((_, index) => effects[index] > 0)
    if (blocked.length)
      conflict(
        `Cancelamento exige tratamento nos módulos responsáveis: ${blocked.join(", ")}. Nenhum estorno automático foi realizado.`,
      )
    const stages = await fluxos.etapas(tx, id)
    if (stages.some((stage) => stage.status !== "PENDENTE"))
      conflict(
        "Há etapas executadas. É necessário um fluxo de estorno operacional.",
      )
    if ((await repo.cancel(ctx, before, tx)).count !== 1)
      conflict("A ordem foi alterada por outra operação.")
    const after = await required(ctx, id, tx)
    await auditar(tx, ctx, before, after)
    return { ordem: after, mensagem: "Ordem cancelada; histórico preservado." }
  })
}
export type Action =
  "liberar" | "iniciar" | "pausar" | "retomar" | "concluir" | "replanejar"

export function action(ctx: Contexto, id: number, action: Action) {
  return repo.write(ctx, async (tx) => {
    const row = await required(ctx, id, tx)
    const source = {
      liberar: "PLANEJADA",
      iniciar: "LIBERADA",
      pausar: "EM_PRODUCAO",
      retomar: "PAUSADA",
      concluir: "EM_PRODUCAO",
      replanejar: "LIBERADA",
    } as const
    if (row.status !== source[action])
      conflict(`Operação ${action} não permitida no estado ${row.status}.`)
    if (action === "replanejar") {
      const stages = await fluxos.etapas(tx, id)
      if (
        (await repo.operationalCounts(ctx, id, tx)).some(Boolean) ||
        stages.some((stage) => stage.status !== "PENDENTE")
      )
        conflict(
          "Há efeitos operacionais que impedem o retorno ao planejamento.",
        )
      if (
        (await repo.transition(ctx, row, { status: "PLANEJADA" }, tx)).count !==
        1
      )
        conflict("A ordem foi alterada por outra operação.")
      const after = await required(ctx, id, tx)
      await auditar(tx, ctx, row, after)
      return after
    }
    if (action === "liberar" || action === "iniciar") await ready(ctx, id, tx)
    const snapshot = await fluxos.snapshot(tx, id)
    if (snapshot && (action === "iniciar" || action === "concluir")) {
      const stages = await fluxos.etapas(tx, id)
      const current = stages.find((stage) => stage.status !== "CONCLUIDA")
      if (
        !current ||
        (action === "concluir" && current.id !== stages.at(-1)?.id)
      )
        return conflict(
          "Conclua as etapas anteriores antes de encerrar a ordem.",
        )
      await executarEtapaNaTransacao(
        tx,
        ctx,
        id,
        current.id,
        action === "iniciar",
      )
      return required(ctx, id, tx)
    }
    if (action === "concluir") {
      await encerrarOrdemNaTransacao(tx, ctx, id, {
        statusEsperado: "EM_PRODUCAO",
        setorEsperado: row.id_setor,
      })
      return required(ctx, id, tx)
    }
    await avancarOrdemNaTransacao(tx, ctx, id, {
      statusEsperado: row.status,
      setorEsperado: row.id_setor,
      statusDestino:
        action === "liberar"
          ? "LIBERADA"
          : action === "pausar"
            ? "PAUSADA"
            : "EM_PRODUCAO",
    })
    return required(ctx, id, tx)
  })
}
export async function listItems(
  ctx: Contexto,
  id: number,
  pagination: Pagination,
) {
  await required(ctx, id)
  return pageResult(await repo.listItems(ctx, id, pagination), pagination)
}
export async function listStages(
  ctx: Contexto,
  id: number,
  pagination: Pagination,
) {
  await required(ctx, id)
  return pageResult(await repo.listStages(ctx, id, pagination), pagination)
}
export function addItem(
  ctx: Contexto,
  id: number,
  input: z.output<typeof ordemItemSchema>,
) {
  return repo.write(ctx, async (tx) => {
    const before = await required(ctx, id, tx)
    if (before.status !== "PLANEJADA")
      conflict("Itens somente podem ser incluídos durante o planejamento.")
    if ((await repo.operationalCounts(ctx, id, tx)).some(Boolean))
      conflict("Há efeitos operacionais que impedem a inclusão de itens.")
    if (before._count.ordem_producao_item >= 200)
      conflict("Limite de 200 itens por ordem.")
    const ficha = await produtoComFicha(tx, ctx, input.id_produto)
    const fluxo = await fluxos.fluxoProduto(tx, ctx, input.id_produto)
    validarFluxo(fluxo)
    const snapshot = await fluxos.snapshot(tx, id)
    if (
      snapshot &&
      (snapshot.fluxoId !== fluxo.id ||
        snapshot.setores.map((s) => s.id).join() !==
          fluxo.setores.map((s) => s.id).join())
    )
      conflict(
        "Os itens devem utilizar o mesmo fluxo preservado no snapshot da ordem.",
      )
    if (!snapshot) {
      if (
        before._count.ordem_producao_fluxo_setor ||
        before._count.ordem_producao_item
      )
        conflict(
          "Esta ordem possui estrutura legada. Utilize o módulo de itens existente.",
        )
      await repo.createStages(ctx, id, fluxo.setores, tx)
      await fluxos.gravarSnapshot(tx, id, fluxo)
    }
    const item = await repo.createItem(ctx, id, input, tx)
    await repo.createPlan(
      ctx,
      id,
      item.id,
      calcularInsumos(input.quantidade, ficha.ficha_tecnica_item),
      tx,
    )
    const after = { ...(await required(ctx, id, tx)), itemIncluido: item }
    await auditar(tx, ctx, before, after)
    return item
  })
}
// Total acumulado + valor esperado: repetição do mesmo comando não duplica produção.
export function recordProduction(
  ctx: Contexto,
  id: number,
  itemId: number,
  input: z.output<typeof apontarSchema>,
) {
  return repo.write(ctx, async (tx) => {
    const row = await required(ctx, id, tx)
    if (row.status !== "EM_PRODUCAO")
      conflict("Apontamentos exigem ordem em produção.")
    const item = await repo.item(ctx, id, itemId, tx)
    if (!item) throw new ProducaoError(404, "Item não encontrado nesta ordem.")
    const snapshot = await fluxos.snapshot(tx, id)
    let sector: number | null = null
    if (snapshot) {
      const stages = await fluxos.etapas(tx, id)
      const stage = stages.find((value) => value.status !== "CONCLUIDA")
      if (
        !stage ||
        stage.id !== stages.at(-1)?.id ||
        stage.status !== "EM_PRODUCAO" ||
        stage.id_setor !== row.id_setor
      )
        return conflict("Registre a produção na última etapa em execução.")
      sector = stage.id_setor
    } else {
      validarApontamentoLegado(await buscarOrdem(tx, ctx, id))
    }
    const total = new Prisma.Decimal(input.quantidade_produzida)
    if (item.quantidade_produzida.eq(total)) return item
    if (!item.quantidade_produzida.eq(input.quantidade_esperada))
      conflict("A quantidade produzida mudou. Recarregue o item.")
    const delta = total.minus(item.quantidade_produzida)
    if (delta.lte(0))
      conflict("Reduções de produção exigem um fluxo de ajuste ou estorno.")
    if (
      (
        await repo.produced(
          ctx,
          id,
          itemId,
          item.quantidade_produzida,
          input.quantidade_produzida,
          tx,
        )
      ).count !== 1
    )
      conflict("Apontamento concorrente. Recarregue o item.")
    // A FK de apontamento exige etapa. O fluxo legado registra o delta na
    // auditoria, junto ao total persistido, sem inventar uma etapa histórica.
    if (sector !== null)
      await repo.registerProduction(ctx, id, itemId, sector, delta, tx)
    const after = await repo.item(ctx, id, itemId, tx)
    const audit = {
      id,
      item: after,
      apontamento: {
        fluxo: snapshot ? "SNAPSHOT" : "LEGADO",
        id_item: itemId,
        id_setor: row.id_setor,
        quantidade_anterior: item.quantidade_produzida.toString(),
        quantidade_produzida: total.toString(),
        delta: delta.toString(),
      },
    }
    await auditar(tx, ctx, { id, item }, audit)
    return after
  })
}
export function stageAction(
  ctx: Contexto,
  id: number,
  etapaId: number,
  iniciar: boolean,
) {
  return repo.write(ctx, async (tx) => {
    await required(ctx, id, tx)
    if (iniciar) await ready(ctx, id, tx)
    await executarEtapaNaTransacao(tx, ctx, id, etapaId, iniciar)
    return required(ctx, id, tx)
  })
}
export function editItem(
  ctx: Contexto,
  id: number,
  itemId: number,
  input: z.output<typeof patchItemSchema> | null,
) {
  return repo.write(ctx, async (tx) => {
    const row = await required(ctx, id, tx)
    if (row.status !== "PLANEJADA")
      conflict("Itens somente podem ser alterados durante o planejamento.")
    if ((await repo.operationalCounts(ctx, id, tx)).some(Boolean))
      conflict(
        "Há efeitos operacionais; os itens históricos não podem ser alterados.",
      )
    const before = await repo.item(ctx, id, itemId, tx)
    if (!before)
      throw new ProducaoError(404, "Item não encontrado nesta ordem.")
    if (before.quantidade_produzida.gt(0))
      conflict("O item possui produção registrada; utilize ajuste ou estorno.")
    if (input?.quantidade !== undefined) {
      const ficha = await produtoComFicha(tx, ctx, before.id_produto)
      await repo.deletePlan(ctx, id, itemId, tx)
      await repo.createPlan(
        ctx,
        id,
        itemId,
        calcularInsumos(input.quantidade, ficha.ficha_tecnica_item),
        tx,
      )
    }
    if (input === null) {
      await repo.deletePlan(ctx, id, itemId, tx)
      await repo.deleteItem(ctx, id, itemId, tx)
    } else await repo.updateItem(ctx, id, itemId, input, tx)
    const after = input === null ? null : await repo.item(ctx, id, itemId, tx)
    const audit = {
      id,
      item: after,
      itemRemovido: input === null ? itemId : null,
    }
    await auditar(tx, ctx, { id, item: before }, audit)
    return input === null
      ? { mensagem: "Item de planejamento removido." }
      : after
  })
}
