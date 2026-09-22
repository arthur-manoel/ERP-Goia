import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type {
  AbrirInput,
  AlterarInput,
  AvancarInput,
  EncerrarInput,
} from "./producao.schema"
import {
  atualizarEstado,
  auditar,
  buscarOrdem,
  produtoComFicha,
  proximoNumero,
  ProducaoError,
  transacao,
  type Contexto,
  type Ordem,
  type Transaction,
} from "./producao.repository"

const limite = new Prisma.Decimal("999999999999.999")
export function calcularInsumos(
  quantidade: string,
  componentes: Array<{
    id_produto_componente: number
    quantidade: Prisma.Decimal
  }>,
) {
  return componentes.map((componente) => {
    if (componente.quantidade.lte(0))
      throw new ProducaoError(
        400,
        "A ficha contém quantidade de componente inválida.",
      )
    // perda_percentual NÃO é aplicada nesta versão: somente quantidade × consumo unitário.
    const total = new Prisma.Decimal(quantidade)
      .mul(componente.quantidade)
      .toDecimalPlaces(3, Prisma.Decimal.ROUND_HALF_UP)
    if (total.lte(0) || total.greaterThan(limite))
      throw new ProducaoError(
        400,
        "O consumo calculado está fora da precisão suportada pelo banco.",
      )
    return {
      id_materia_prima: componente.id_produto_componente,
      quantidade_por_peca: componente.quantidade,
      quantidade_necessaria: total,
    }
  })
}
function resposta(ordem: Ordem) {
  return {
    ordem,
    perdaAplicada: false,
    // Encerramento administrativo não executa reserva, baixa nem consumo efetivo.
    baixaEstoque: "pendente" as const,
    disponibilidadeEstoque: "nao_verificada" as const,
  }
}
async function finalizar(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  antes: Ordem | null,
) {
  const depois = await buscarOrdem(tx, ctx, id)
  await auditar(tx, ctx, antes, depois)
  return resposta(depois)
}
async function gravarInsumos(
  tx: Transaction,
  id: number,
  idItem: number,
  insumos: ReturnType<typeof calcularInsumos>,
) {
  await tx.ordem_producao_consumo_planejado.deleteMany({
    where: { id_ordem_producao: id, id_ordem_producao_item: idItem },
  })
  await tx.ordem_producao_consumo_planejado.createMany({
    data: insumos.map((item) => ({
      ...item,
      id_ordem_producao: id,
      id_ordem_producao_item: idItem,
      // Disponibilidade não é apurada por esta API; a resposta explicita essa limitação.
    })),
  })
}
function validarPrevisao(
  previsao: Date | null | undefined,
  inicio: Date | null,
) {
  if (previsao && inicio && previsao < inicio)
    throw new ProducaoError(
      400,
      "A previsão não pode ser anterior ao início da produção.",
    )
}
export function abrirOrdem(ctx: Contexto, input: AbrirInput) {
  return transacao(async (tx) => {
    const ficha = await produtoComFicha(tx, ctx, input.idProduto)
    const insumos = calcularInsumos(input.quantidade, ficha.ficha_tecnica_item)
    if (input.setores.length) {
      const count = await tx.setores.count({
        where: {
          id: { in: input.setores },
          id_empresa: ctx.idEmpresa,
          status: "ATIVO",
        },
      })
      if (count !== input.setores.length)
        throw new ProducaoError(400, "Selecione setores ativos da empresa.")
    }
    const ordem = await tx.ordem_producao.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_usuario: ctx.idUsuario,
        numero: await proximoNumero(tx, ctx.idEmpresa),
        status: "PLANEJADA",
        quantidade_planejada: input.quantidade,
        observacao: input.observacao,
        data_previsao: input.dataPrevisao,
        prioridade: input.prioridade,
        ordem_producao_item: {
          create: {
            id_produto: input.idProduto,
            quantidade: input.quantidade,
            tamanho: input.tamanho,
          },
        },
        ordem_producao_fluxo_setor: {
          create: input.setores.map((id_setor, index) => ({
            id_setor,
            ordem: index + 1,
          })),
        },
      },
      include: { ordem_producao_item: true },
    })
    await gravarInsumos(tx, ordem.id, ordem.ordem_producao_item[0].id, insumos)
    return finalizar(tx, ctx, ordem.id, null)
  })
}
function validarEstado(
  ordem: Ordem,
  status: Ordem["status"],
  setor?: number | null,
) {
  if (
    ordem.status !== status ||
    (setor !== undefined && ordem.id_setor !== setor)
  )
    throw new ProducaoError(
      409,
      "O estado esperado não corresponde ao estado atual da ordem.",
    )
  if (ordem.status === "CONCLUIDA" || ordem.status === "CANCELADA")
    throw new ProducaoError(
      409,
      "Ordens concluídas ou canceladas não podem ser alteradas.",
    )
}
export function alterarOrdem(ctx: Contexto, id: number, input: AlterarInput) {
  return transacao(async (tx) => {
    const ordem = await buscarOrdem(tx, ctx, id)
    validarEstado(ordem, input.statusEsperado)
    const alteraComposicao =
      input.idProduto !== undefined ||
      input.quantidade !== undefined ||
      input.tamanho !== undefined
    // Só PLANEJADA admite mudança estrutural ou recálculo, inclusive antes de EM_PRODUCAO.
    if (
      ordem.status !== "PLANEJADA" &&
      (alteraComposicao || input.prioridade !== undefined)
    )
      throw new ProducaoError(
        409,
        "Fora de PLANEJADA, somente observação e previsão podem ser alteradas.",
      )
    validarPrevisao(input.dataPrevisao, ordem.data_inicio)
    await atualizarEstado(tx, ctx, ordem, {
      observacao: input.observacao,
      data_previsao: input.dataPrevisao,
      prioridade: input.prioridade,
      quantidade_planejada: input.quantidade,
    })
    if (alteraComposicao) {
      if (ordem.ordem_producao_item.length !== 1)
        throw new ProducaoError(
          409,
          "A alteração de composição exige uma ordem com um único item.",
        )
      const item = ordem.ordem_producao_item[0]
      const idProduto = input.idProduto ?? item.id_produto
      const quantidade = input.quantidade ?? item.quantidade.toString()
      // Observação/previsão não recalculam o planejamento existente.
      if (input.idProduto !== undefined || input.quantidade !== undefined) {
        const ficha = await produtoComFicha(tx, ctx, idProduto)
        await gravarInsumos(
          tx,
          id,
          item.id,
          calcularInsumos(quantidade, ficha.ficha_tecnica_item),
        )
      }
      await tx.ordem_producao_item.update({
        where: { id: item.id },
        data: {
          id_produto: idProduto,
          quantidade,
          tamanho: input.tamanho,
          ...(idProduto !== item.id_produto
            ? { id_cor: null, id_tamanho: null }
            : {}),
        },
      })
    }
    return finalizar(tx, ctx, id, ordem)
  })
}
const transicoes: Partial<Record<Ordem["status"], Ordem["status"][]>> = {
  PLANEJADA: ["LIBERADA", "AGUARDANDO_MATERIAL"],
  AGUARDANDO_MATERIAL: ["LIBERADA"],
  LIBERADA: ["EM_PRODUCAO", "AGUARDANDO_MATERIAL"],
  EM_PRODUCAO: ["EM_PRODUCAO", "PAUSADA"],
  PAUSADA: ["EM_PRODUCAO"],
}
function validarPendencias(ordem: Ordem) {
  if (
    ordem.ordem_producao_movimentacao_setor.some(
      (mov) => mov.status === "EM_TRANSITO",
    )
  )
    throw new ProducaoError(
      409,
      "A ordem possui movimentação de setor pendente.",
    )
}
function validarPlanejamento(ordem: Ordem) {
  if (
    ordem.quantidade_planejada.lte(0) ||
    !ordem.ordem_producao_item.length ||
    ordem.ordem_producao_item.some(
      (item) =>
        item.quantidade.lte(0) || !item.ordem_producao_consumo_planejado.length,
    )
  )
    throw new ProducaoError(
      409,
      "A ordem precisa de itens e insumos previstos antes de avançar.",
    )
}
export function avancarOrdem(ctx: Contexto, id: number, input: AvancarInput) {
  return transacao(async (tx) => {
    const ordem = await buscarOrdem(tx, ctx, id)
    validarEstado(ordem, input.statusEsperado, input.setorEsperado)
    if (!transicoes[ordem.status]?.includes(input.statusDestino))
      throw new ProducaoError(409, "Transição de produção não permitida.")
    validarPlanejamento(ordem)
    validarPendencias(ordem)
    let setor = ordem.id_setor
    const fluxo = ordem.ordem_producao_fluxo_setor
    if (input.statusDestino === "EM_PRODUCAO" && ordem.status !== "PAUSADA") {
      if (ordem.status === "LIBERADA") {
        setor = fluxo[0]?.id_setor ?? null
      } else {
        const index = fluxo.findIndex((item) => item.id_setor === setor)
        if (index < 0 || index === fluxo.length - 1)
          throw new ProducaoError(
            409,
            "Não há próximo setor. Use o encerramento ao concluir a produção.",
          )
        setor = fluxo[index + 1].id_setor
      }
    }
    if (setor !== null) {
      const ativo = await tx.setores.findFirst({
        where: { id: setor, id_empresa: ctx.idEmpresa, status: "ATIVO" },
      })
      if (!ativo)
        throw new ProducaoError(
          409,
          "O setor de destino não está ativo nesta empresa.",
        )
    }
    const inicio =
      input.statusDestino === "EM_PRODUCAO"
        ? (ordem.data_inicio ?? new Date())
        : ordem.data_inicio
    validarPrevisao(ordem.data_previsao, inicio)
    await atualizarEstado(tx, ctx, ordem, {
      status: input.statusDestino,
      id_setor: setor,
      data_inicio: inicio,
    })
    if (setor !== null && setor !== ordem.id_setor) {
      // Avanço integral confirmado: não representa transporte parcial nem baixa de estoque.
      await tx.ordem_producao_movimentacao_setor.create({
        data: {
          id_ordem_producao: id,
          id_setor_origem: ordem.id_setor,
          id_setor_destino: setor,
          id_usuario_envio: ctx.idUsuario,
          id_usuario_recebimento: ctx.idUsuario,
          status: "ENTREGUE",
          data_recebimento: new Date(),
        },
      })
    }
    return finalizar(tx, ctx, id, ordem)
  })
}
export function encerrarOrdem(ctx: Contexto, id: number, input: EncerrarInput) {
  return transacao(async (tx) => {
    const ordem = await buscarOrdem(tx, ctx, id)
    validarEstado(ordem, input.statusEsperado, input.setorEsperado)
    if (ordem.status !== "EM_PRODUCAO" || !ordem.data_inicio)
      throw new ProducaoError(
        409,
        "Somente ordens em produção podem ser encerradas.",
      )
    validarPlanejamento(ordem)
    validarPendencias(ordem)
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
    await atualizarEstado(tx, ctx, ordem, {
      status: "CONCLUIDA",
      data_conclusao: new Date(),
    })
    // Encerrar confirma a produção integral planejada; não lança consumo ou estoque.
    for (const item of ordem.ordem_producao_item) {
      await tx.ordem_producao_item.update({
        where: { id: item.id },
        data: { quantidade_produzida: item.quantidade },
      })
    }
    return finalizar(tx, ctx, id, ordem)
  })
}
