import "server-only"
import { prisma } from "@/lib/prisma"
import type { Contexto, Tx } from "@/modules/reservas/operacoes"
import {
  acesso,
  avaliarVinculo,
  podeConsultar,
  exigir,
} from "@/modules/cancelamentos/cancelamentos.authorization"
export async function evento(
  tx: Tx,
  ctx: Contexto,
  id: number,
  tipo: string,
  destino: "GERENCIA" | "SOLICITANTE" | "ESTOQUE" | "FINANCEIRO" | "TODOS",
  titulo: string,
  mensagem: string,
  chave = tipo,
) {
  await tx.notificacao_evento.upsert({
    where: {
      id_empresa_chave: {
        id_empresa: ctx.idEmpresa,
        chave: `cancelamento:${id}:${chave}`,
      },
    },
    create: {
      id_empresa: ctx.idEmpresa,
      chave: `cancelamento:${id}:${chave}`,
      id_cancelamento: id,
      tipo,
      destino,
      titulo,
      mensagem,
    },
    update: {},
  })
}
/** Outbox confirmada com o negócio; entrega posterior nunca desfaz o estorno. */
export async function distribuir(ctx: Contexto) {
  try {
    const pendente = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} FOR UPDATE`
        exigir(podeConsultar(await acesso(tx, ctx)))
        const pendentes = await tx.notificacao_evento.findMany({
          where: { id_empresa: ctx.idEmpresa, processado_em: null },
          orderBy: [{ tentativas: "asc" }, { id: "asc" }],
          take: 25,
          include: {
            pedido_cancelamento: { select: { id_solicitante: true } },
          },
        })
        const links = await tx.usuario_empresa.findMany({
          where: {
            id_empresa: ctx.idEmpresa,
            status: "ATIVO",
            usuarios: { status: "ATIVO" },
            empresas: { status: "ATIVA" },
            cargos: { status: "ATIVO" },
          },
          include: { usuarios: true, cargos: true, permissoes_usuario: true },
        })
        for (const e of pendentes) {
          let destinatarios = 0
          for (const link of links) {
            const a = avaliarVinculo(link)
            const destino =
              e.destino === "GERENCIA"
                ? a.gerente
                : e.destino === "ESTOQUE"
                  ? a.estoque
                  : e.destino === "FINANCEIRO"
                    ? a.financeiro
                    : e.destino === "SOLICITANTE"
                      ? link.id_usuario === e.pedido_cancelamento.id_solicitante
                      : podeConsultar(a)
            if (destino && podeConsultar(a)) {
              destinatarios++
              await tx.notificacao_interna.upsert({
                where: {
                  id_evento_id_usuario: {
                    id_evento: e.id,
                    id_usuario: link.id_usuario,
                  },
                },
                create: {
                  id_empresa: ctx.idEmpresa,
                  id_usuario: link.id_usuario,
                  id_evento: e.id,
                },
                update: {},
              })
            }
          }
          await tx.notificacao_evento.update({
            where: { id: e.id },
            data: {
              processado_em: destinatarios > 0 ? new Date() : null,
              tentativas: { increment: 1 },
              ultimo_erro:
                destinatarios > 0
                  ? null
                  : "Sem destinatário ativo autorizado na empresa.",
            },
          })
        }
        return (
          (await tx.notificacao_evento.count({
            where: { id_empresa: ctx.idEmpresa, processado_em: null },
          })) > 0
        )
      },
      { isolationLevel: "Serializable", timeout: 60000, maxWait: 10000 },
    )
    return { entregaPendente: pendente }
  } catch {
    // O erro é sanitizado: nenhuma consulta, credencial ou dado financeiro é exposto.
    try {
      await prisma.notificacao_evento.updateMany({
        where: { id_empresa: ctx.idEmpresa, processado_em: null },
        data: {
          tentativas: { increment: 1 },
          ultimo_erro: "Entrega pendente; repetir o processamento interno.",
        },
      })
    } catch {}
    return { entregaPendente: true }
  }
}
export async function consultar(
  tx: Tx,
  ctx: Contexto,
  pagina: number,
  limite: number,
) {
  const where = await filtroVisivel(tx, ctx)
  const [rows, total] = await Promise.all([
    tx.notificacao_interna.findMany({
      where,
      orderBy: { id: "desc" },
      take: limite,
      skip: (pagina - 1) * limite,
      include: { notificacao_evento: true },
    }),
    tx.notificacao_interna.count({ where }),
  ])
  return {
    itens: rows.map((n) => ({
      id: n.id,
      lidaEm: n.lida_em,
      criadaEm: n.criada_em,
      idCancelamento: n.notificacao_evento.id_cancelamento,
      titulo: n.notificacao_evento.titulo,
      mensagem: n.notificacao_evento.mensagem,
    })),
    pagina,
    limite,
    total,
  }
}

async function filtroVisivel(tx: Tx, ctx: Contexto) {
  const a = await acesso(tx, ctx)
  exigir(podeConsultar(a))
  const destinos = ["TODOS"]
  if (a.gerente) destinos.push("GERENCIA")
  if (a.financeiro) destinos.push("FINANCEIRO")
  if (a.estoque) destinos.push("ESTOQUE")
  return {
    id_empresa: ctx.idEmpresa,
    id_usuario: ctx.idUsuario,
    notificacao_evento: {
      id_empresa: ctx.idEmpresa,
      OR: [
        { destino: { in: destinos } },
        {
          destino: "SOLICITANTE",
          pedido_cancelamento: { id_solicitante: ctx.idUsuario },
        },
      ],
    },
  }
}

export async function marcarLida(tx: Tx, ctx: Contexto, id: number) {
  const n = await tx.notificacao_interna.updateMany({
    where: { ...(await filtroVisivel(tx, ctx)), id, lida_em: null },
    data: { lida_em: new Date() },
  })
  return { atualizadas: n.count }
}
