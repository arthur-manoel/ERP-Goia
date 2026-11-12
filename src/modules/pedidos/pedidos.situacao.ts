import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { Contexto } from "./pedidos.authorization"
import type { ListarInput } from "./pedidos.schema"
import { leitura, listar } from "./pedidos.repository"

export const consultarSituacao = (ctx: Contexto, input: ListarInput) =>
  leitura(async (tx) => {
    const lista = await listar(tx, ctx, input)
    const pedidos = await tx.pedido_cliente.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        id: { in: lista.dados.map((p) => p.idPedido) },
      },
      include: {
        clientes: { select: { nome_razao_social: true } },
        ordem_producao: {
          where: { id_empresa: ctx.idEmpresa },
          select: { id: true, numero: true, status: true },
        },
        pedido_cliente_item: {
          orderBy: [{ numero_item: "asc" }, { id: "asc" }],
          include: {
            cores: { select: { nome: true } },
            tamanhos: { select: { nome: true } },
            reserva_estoque: {
              where: { id_empresa: ctx.idEmpresa, status: "ATIVA" },
            },
            ordem_producao_item: {
              where: { ordem_producao: { id_empresa: ctx.idEmpresa } },
              select: {
                ordem_producao: {
                  select: { id: true, numero: true, status: true },
                },
              },
            },
          },
        },
      },
    })
    const porId = new Map(pedidos.map((p) => [p.id, p]))
    return {
      paginacao: lista.paginacao,
      dados: lista.dados.flatMap((referencia) => {
        const p = porId.get(referencia.idPedido)!
        return p.pedido_cliente_item.map((i) => {
          const reservada = i.reserva_estoque
            .filter(
              (r) =>
                r.id_produto === i.id_produto &&
                r.id_variacao === i.id_variacao,
            )
            .reduce(
              (s, r) =>
                s.plus(
                  Prisma.Decimal.max(
                    0,
                    r.quantidade
                      .minus(r.quantidade_consumida)
                      .minus(r.quantidade_liberada),
                  ),
                ),
              new Prisma.Decimal(0),
            )
          const ordens = [
            ...new Map(
              [
                ...p.ordem_producao,
                ...i.ordem_producao_item.map((o) => o.ordem_producao),
              ].map((o) => [o.id, o]),
            ).values(),
          ]
          return {
            idItem: i.id,
            pedido: p.numero,
            cliente: p.clientes.nome_razao_social,
            item: [i.descricao, i.cores?.nome, i.tamanhos?.nome]
              .filter(Boolean)
              .join(" — "),
            quantidade: i.quantidade.toFixed(3),
            status: p.status,
            reservada: reservada.toFixed(3),
            ordens,
          }
        })
      }),
    }
  })
