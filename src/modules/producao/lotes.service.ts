import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { executar, conferir, auditar } from "@/modules/reservas/operacoes"
import { snapshot } from "@/modules/fluxos/fluxos.repository"
import {
  buscarOrdem,
  ProducaoError,
  type Contexto,
  type Transaction,
  type Ordem,
} from "./producao.repository"
import { usaLotes, posicoesLote } from "./lotes.repository"
import { totaisDaOrdem } from "../apontamentos/apontamentos.repository"
import {
  validarDisponibilidade,
  incluirProducaoFinalLegada,
} from "../apontamentos/apontamentos.regras"
import type { EnvioLote, RecebimentoLote } from "./lotes.schema"

const conflito = (mensagem: string): never => {
  throw new ProducaoError(409, mensagem)
}
async function autorDoSetor(tx: Transaction, ctx: Contexto, setor: number) {
  const vinculo = await tx.usuario_empresa.findUniqueOrThrow({
    where: {
      id_usuario_id_empresa: {
        id_usuario: ctx.idUsuario,
        id_empresa: ctx.idEmpresa,
      },
    },
    include: { usuarios: { select: { nivel_acesso: true } } },
  })
  if (
    vinculo.nivel_acesso !== "EMPRESA" &&
    vinculo.usuarios.nivel_acesso !== "ADMIN" &&
    vinculo.id_setor !== setor
  )
    throw new ProducaoError(
      403,
      "A operação exige vínculo com o setor responsável.",
    )
}
function emExecucao(ordem: Ordem) {
  if (ordem.status !== "EM_PRODUCAO")
    conflito("Retome ou inicie a ordem antes de movimentar parcelas.")
}
async function ativar(tx: Transaction, ctx: Contexto, ordem: Ordem) {
  if (await usaLotes(tx, ordem.id)) return
  const fluxo = await snapshot(tx, ordem.id)
  const etapas = ordem.ordem_producao_fluxo_setor
  if (
    !fluxo ||
    etapas.length < 2 ||
    fluxo.setores.length !== etapas.length ||
    fluxo.setores.some((s, i) => s.id !== etapas[i].id_setor) ||
    etapas[0].status !== "EM_PRODUCAO" ||
    etapas.slice(1).some((e) => e.status !== "PENDENTE") ||
    ordem.ordem_producao_item.some((i) => !i.quantidade_produzida.isZero()) ||
    ordem.ordem_producao_movimentacao_setor.some(
      (m) => m.id_setor_origem !== null,
    )
  )
    conflito(
      "Ative o fracionamento antes de avançar para a segunda etapa. Passagens legadas permanecem no protocolo anterior.",
    )
  const setores = etapas.slice(1).map((e) => e.id_setor)
  if (
    (await tx.ordem_producao_apontamento.count({
      where: { id_ordem_producao: ordem.id, id_setor: { in: setores } },
    })) ||
    (await tx.producao_confirmacao.count({
      where: { id_ordem_producao: ordem.id },
    }))
  )
    conflito(
      "Há produção posterior registrada. O histórico não pode ser convertido em parcelas presumidas.",
    )
  await tx.$executeRaw`INSERT INTO producao_lote_protocolo(id_empresa,id_ordem_producao) VALUES(${ctx.idEmpresa},${ordem.id})`
}
export function enviarLote(
  ctx: Contexto,
  id: number,
  chave: string,
  input: EnvioLote,
) {
  return executar(
    ctx,
    chave,
    "ENVIO_PRODUCAO_SETOR",
    { id, ...input },
    [["ORDENS_PRODUCAO", "editar"]],
    async (tx) => {
      const ordem = await buscarOrdem(tx, ctx, id)
      emExecucao(ordem)
      const etapas = ordem.ordem_producao_fluxo_setor
      const index = etapas.findIndex((e) => e.id === input.idEtapaOrigem)
      const origem = etapas[index],
        destino = etapas[index + 1]
      if (
        !origem ||
        !destino ||
        destino.id !== input.idEtapaDestino ||
        origem.status !== "EM_PRODUCAO" ||
        destino.status === "CONCLUIDA"
      )
        conflito(
          "Envie somente da etapa em execução para a etapa seguinte do snapshot.",
        )
      await autorDoSetor(tx, ctx, origem.id_setor)
      const ativos = await tx.setores.count({
        where: {
          id: { in: [origem.id_setor, destino.id_setor] },
          id_empresa: ctx.idEmpresa,
          status: "ATIVO",
        },
      })
      if (ativos !== 2)
        conflito("Origem e destino devem estar ativos na empresa.")
      await ativar(tx, ctx, ordem)
      const posicoes = await posicoesLote(tx, id)
      for (const linha of input.itens) {
        const posicao = posicoes
          .find((p) => p.idItem === linha.idItem)
          ?.etapas.find((e) => e.idEtapa === origem.id)
        if (!posicao)
          throw new ProducaoError(404, "Item não encontrado nesta ordem.")
        if (new Prisma.Decimal(linha.quantidade).gt(posicao.disponivelEnvio))
          conflito(
            "Quantidade acima da produção válida ainda disponível para envio.",
          )
      }
      const movimento = await tx.ordem_producao_movimentacao_setor.create({
        data: {
          id_ordem_producao: id,
          id_setor_origem: origem.id_setor,
          id_setor_destino: destino.id_setor,
          id_usuario_envio: ctx.idUsuario,
          status: "EM_TRANSITO",
          quantidade: null,
          observacao: input.observacao,
        },
      })
      await tx.$executeRaw`INSERT INTO producao_remessa
      (id_movimentacao,id_empresa,id_ordem_producao,id_etapa_origem,id_setor_origem,id_etapa_destino,id_setor_destino)
      VALUES(${movimento.id},${ctx.idEmpresa},${id},${origem.id},${origem.id_setor},${destino.id},${destino.id_setor})`
      for (const linha of input.itens)
        await tx.$executeRaw`INSERT INTO ordem_producao_movimentacao_item(id_movimentacao,id_ordem_producao_item,id_ordem_producao,quantidade)
        VALUES(${movimento.id},${linha.idItem},${id},${linha.quantidade})`
      const resultado = {
        idMovimentacao: movimento.id,
        idOrdem: id,
        status: "EM_TRANSITO",
        itens: input.itens,
      }
      await auditar(
        tx,
        ctx,
        "ordem_producao_movimentacao_setor",
        movimento.id,
        null,
        resultado,
      )
      return resultado
    },
    {
      validar: async (tx) => {
        const etapa = await tx.ordem_producao_fluxo_setor.findFirst({
          where: {
            id: input.idEtapaOrigem,
            id_ordem_producao: id,
            ordem_producao: { id_empresa: ctx.idEmpresa },
          },
        })
        if (!etapa)
          throw new ProducaoError(404, "Etapa não encontrada nesta ordem.")
        await autorDoSetor(tx, ctx, etapa.id_setor)
      },
    },
  )
}
export function receberLote(
  ctx: Contexto,
  id: number,
  mov: number,
  chave: string,
  input: RecebimentoLote,
) {
  return executar(
    ctx,
    chave,
    "RECEBIMENTO_PRODUCAO_SETOR",
    { id, mov, ...input },
    [["ORDENS_PRODUCAO", "editar"]],
    async (tx) => {
      const ordem = await buscarOrdem(tx, ctx, id)
      emExecucao(ordem)
      const [remessa] = await tx.$queryRaw<
        { id_etapa_destino: number; id_setor_destino: number }[]
      >`
      SELECT id_etapa_destino,id_setor_destino FROM producao_remessa WHERE id_movimentacao=${mov}
      AND id_ordem_producao=${id} AND id_empresa=${ctx.idEmpresa}`
      if (!remessa)
        throw new ProducaoError(
          404,
          "Envio quantitativo não encontrado nesta ordem.",
        )
      await autorDoSetor(tx, ctx, remessa.id_setor_destino)
      const etapa = ordem.ordem_producao_fluxo_setor.find(
        (e) => e.id === remessa.id_etapa_destino,
      )!
      if (etapa.status === "CONCLUIDA")
        conflito("A etapa de destino já está concluída.")
      const setor = await tx.setores.findFirst({
        where: {
          id: remessa.id_setor_destino,
          id_empresa: ctx.idEmpresa,
          status: "ATIVO",
        },
      })
      if (!setor) conflito("Setor de destino inativo.")
      const linhas = await tx.$queryRaw<
        {
          id: number
          id_item: number
          quantidade: Prisma.Decimal
          recebida: Prisma.Decimal
        }[]
      >`
      SELECT l.id,l.id_ordem_producao_item AS id_item,l.quantidade,COALESCE(SUM(e.quantidade),0) AS recebida
      FROM ordem_producao_movimentacao_item l LEFT JOIN producao_recebimento_item e ON e.id_linha=l.id
      WHERE l.id_movimentacao=${mov} GROUP BY l.id,l.id_ordem_producao_item,l.quantidade`
      for (const linha of input.itens) {
        const enviada = linhas.find((l) => l.id_item === linha.idItem)
        if (!enviada)
          throw new ProducaoError(404, "Item não pertence a este envio.")
        if (
          new Prisma.Decimal(enviada.recebida)
            .plus(linha.quantidade)
            .gt(enviada.quantidade)
        )
          conflito("Recebimento acumulado acima da quantidade enviada.")
      }
      await tx.$executeRaw`INSERT INTO producao_recebimento(id_movimentacao,id_ordem_producao,id_empresa,id_usuario)
      VALUES(${mov},${id},${ctx.idEmpresa},${ctx.idUsuario})`
      const [registro] = await tx.$queryRaw<
        { id: bigint }[]
      >`SELECT LAST_INSERT_ID() AS id`
      const idRecebimento = Number(registro.id)
      for (const linha of input.itens) {
        const enviada = linhas.find((l) => l.id_item === linha.idItem)!
        await tx.$executeRaw`INSERT INTO producao_recebimento_item(id_recebimento,id_movimentacao,id_ordem_producao,id_linha,quantidade)
        VALUES(${idRecebimento},${mov},${id},${enviada.id},${linha.quantidade})`
        enviada.recebida = new Prisma.Decimal(enviada.recebida).plus(
          linha.quantidade,
        )
      }
      const completa = linhas.every((l) =>
        new Prisma.Decimal(l.recebida).eq(l.quantidade),
      )
      if (completa)
        await tx.ordem_producao_movimentacao_setor.update({
          where: { id: mov },
          data: {
            status: "ENTREGUE",
            id_usuario_recebimento: ctx.idUsuario,
            data_recebimento: new Date(),
          },
        })
      if (etapa.status === "PENDENTE")
        await tx.ordem_producao_fluxo_setor.update({
          where: { id: etapa.id },
          data: { status: "EM_PRODUCAO", data_inicio: new Date() },
        })
      await posicoesLote(tx, id)
      const resultado = {
        idRecebimento,
        idMovimentacao: mov,
        idOrdem: id,
        status: completa ? "ENTREGUE" : "EM_TRANSITO",
        itens: input.itens,
      }
      await auditar(
        tx,
        ctx,
        "producao_recebimento",
        idRecebimento,
        null,
        resultado,
      )
      return resultado
    },
    {
      validar: async (tx) => {
        const [remessa] = await tx.$queryRaw<
          { id_setor_destino: number }[]
        >`SELECT id_setor_destino FROM producao_remessa WHERE id_movimentacao=${mov} AND id_ordem_producao=${id} AND id_empresa=${ctx.idEmpresa}`
        if (!remessa)
          throw new ProducaoError(404, "Envio não encontrado nesta ordem.")
        await autorDoSetor(tx, ctx, remessa.id_setor_destino)
      },
    },
  )
}
export async function consultarLotes(
  ctx: Contexto,
  id: number,
  pagina: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await conferir(tx, ctx, [["ORDENS_PRODUCAO", "ler"]])
      const ordem = await tx.ordem_producao.findFirst({
        where: { id, id_empresa: ctx.idEmpresa },
        include: {
          ordem_producao_item: {
            include: { produtos: { select: { nome: true, unidade: true } } },
          },
          ordem_producao_fluxo_setor: {
            orderBy: { ordem: "asc" },
            include: { setores: { select: { id_empresa: true, nome: true } } },
          },
        },
      })
      if (!ordem) throw new ProducaoError(404, "Ordem não encontrada.")
      const ativo = await usaLotes(tx, id)
      const movimentos = await tx.ordem_producao_movimentacao_setor.findMany({
        where: { id_ordem_producao: id },
        orderBy: { id: "desc" },
        skip: (pagina - 1) * 20,
        take: 20,
        include: { ordem_producao_movimentacao_item: true },
      })
      const ids = movimentos.map((m) => m.id)
      const recebimentos = ids.length
        ? await tx.$queryRaw<
            {
              id: number
              id_movimentacao: number
              id_usuario: number
              data_recebimento: Date
              id_item: number
              quantidade: Prisma.Decimal
            }[]
          >(
            Prisma.sql`SELECT r.id,r.id_movimentacao,r.id_usuario,r.data_recebimento,l.id_ordem_producao_item AS id_item,e.quantidade
        FROM producao_recebimento r JOIN producao_recebimento_item e ON e.id_recebimento=r.id
        JOIN ordem_producao_movimentacao_item l ON l.id=e.id_linha
        WHERE r.id_ordem_producao=${id} AND r.id_movimentacao IN (${Prisma.join(ids)}) ORDER BY r.id,e.id_linha`,
          )
        : []
      const itens = ordem.ordem_producao_item.map((item) => ({
        idItem: item.id,
        idProduto: item.id_produto,
        idCor: item.id_cor,
        idTamanho: item.id_tamanho,
        produto: item.produtos.nome,
        unidade: item.produtos.unidade,
      }))
      const etapas = ordem.ordem_producao_fluxo_setor
      const avancadaLegada =
        !ativo &&
        (etapas[0]?.status !== "EM_PRODUCAO" ||
          etapas.slice(1).some((e) => e.status !== "PENDENTE") ||
          (await tx.ordem_producao_movimentacao_setor.count({
            where: { id_ordem_producao: id, id_setor_origem: { not: null } },
          })) > 0)
      let posicoes: Awaited<ReturnType<typeof posicoesLote>> = [],
        pendencia = ""
      const resumoLegado: {
        idItem: number
        etapas: ReturnType<typeof validarDisponibilidade>
      }[] = []
      try {
        if (!avancadaLegada) posicoes = await posicoesLote(tx, id)
        else {
          const totais = await totaisDaOrdem(tx, id)
          for (const item of ordem.ordem_producao_item) {
            const acumulados = totais.filter(
              (t) => t.id_ordem_producao_item === item.id,
            )
            resumoLegado.push({
              idItem: item.id,
              etapas: validarDisponibilidade(
                etapas,
                item.quantidade,
                etapas.at(-1)
                  ? incluirProducaoFinalLegada(
                      acumulados,
                      etapas.at(-1)!.id_setor,
                      item.quantidade_produzida,
                    )
                  : acumulados,
              ),
            })
          }
        }
      } catch (e) {
        if (ativo || !(e instanceof ProducaoError)) throw e
        pendencia = e.message
      }
      return {
        pendencia,
        itens,
        resumoLegado,
        idOrdem: id,
        numero: ordem.numero,
        status: ordem.status,
        protocoloQuantitativo: ativo,
        etapas: ordem.ordem_producao_fluxo_setor.map(({ setores, ...e }) => ({
          ...e,
          nome:
            setores.id_empresa === ctx.idEmpresa
              ? setores.nome
              : "Setor indisponível",
        })),
        posicoes,
        movimentos,
        recebimentos,
        pagina,
        total: await tx.ordem_producao_movimentacao_setor.count({
          where: { id_ordem_producao: id },
        }),
      }
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  )
}
