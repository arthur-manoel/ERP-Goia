import "server-only"

import { HttpError } from "@/lib/api/errors"
import { conferir, type Contexto, type Tx } from "./operacoes"
import type { FiltroTransferencias } from "./reservas.schema"

export async function listarTransferencias(
  tx: Tx,
  ctx: Contexto,
  filtro: FiltroTransferencias,
) {
  const where = {
    id_empresa: ctx.idEmpresa,
    status: filtro.status,
    id: filtro.idTransferencia,
    id_local_destino: filtro.idLocalDestino,
  }
  const nome = { select: { nome: true } } as const
  const [registros, total, podeMovimentar] = await Promise.all([
    tx.transferencia_estoque.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (filtro.pagina - 1) * filtro.limite,
      take: filtro.limite,
      include: {
        locais_estoque_transferencia_estoque_id_empresa_id_local_origemTolocais_estoque:
          nome,
        locais_estoque_transferencia_estoque_id_empresa_id_local_destinoTolocais_estoque:
          nome,
        produto_variacoes: {
          select: {
            cores: { select: { nome: true, id_empresa: true } },
            tamanhos: { select: { nome: true, id_empresa: true } },
          },
        },
        usuario_empresa: { select: { usuarios: nome } },
        movimentacao_estoque_transferencia_estoque_id_movimento_saidaTomovimentacao_estoque:
          {
            select: {
              id_empresa: true,
              id_produto: true,
              produtos: { select: { nome: true, unidade: true } },
            },
          },
        movimentacao_estoque_transferencia_estoque_id_movimento_entradaTomovimentacao_estoque:
          {
            select: {
              id_empresa: true,
              tipo: true,
              origem_id: true,
              usuarios: nome,
            },
          },
      },
    }),
    tx.transferencia_estoque.count({ where }),
    conferir(tx, ctx, [["ESTOQUE", "editar"]]).then(
      () => true,
      (error: unknown) => {
        if (error instanceof HttpError && error.status === 403) return false
        throw error
      },
    ),
  ])
  const idsSetores = [
    ...new Set(
      registros.flatMap((r) => [r.id_setor_origem, r.id_setor_destino]),
    ),
  ]
  const setores = idsSetores.length
    ? await tx.setores.findMany({
        where: { id_empresa: ctx.idEmpresa, id: { in: idsSetores } },
        select: { id: true, nome: true },
      })
    : []
  const nomesSetores = new Map(setores.map((s) => [s.id, s.nome]))
  return {
    total,
    pagina: filtro.pagina,
    totalPaginas: Math.ceil(total / filtro.limite),
    podeMovimentar,
    dados: registros.map(
      ({
        locais_estoque_transferencia_estoque_id_empresa_id_local_origemTolocais_estoque:
          origem,
        locais_estoque_transferencia_estoque_id_empresa_id_local_destinoTolocais_estoque:
          destino,
        movimentacao_estoque_transferencia_estoque_id_movimento_saidaTomovimentacao_estoque:
          saida,
        movimentacao_estoque_transferencia_estoque_id_movimento_entradaTomovimentacao_estoque:
          entrada,
        produto_variacoes: variacao,
        usuario_empresa: remetente,
        ...r
      }) => ({
        ...r,
        quantidade: r.quantidade.toFixed(3),
        produto:
          saida.id_empresa === ctx.idEmpresa &&
          saida.id_produto === r.id_produto
            ? saida.produtos
            : null,
        variacao: variacao
          ? {
              cor:
                variacao.cores &&
                (variacao.cores.id_empresa === null ||
                  variacao.cores.id_empresa === ctx.idEmpresa)
                  ? variacao.cores.nome
                  : null,
              tamanho:
                variacao.tamanhos?.id_empresa === ctx.idEmpresa
                  ? variacao.tamanhos.nome
                  : null,
            }
          : null,
        origem: {
          local: origem.nome,
          setor: nomesSetores.get(r.id_setor_origem) ?? null,
        },
        destino: {
          local: destino.nome,
          setor: nomesSetores.get(r.id_setor_destino) ?? null,
        },
        enviadoPor: remetente.usuarios.nome,
        recebidoPor:
          entrada?.id_empresa === ctx.idEmpresa &&
          entrada.tipo === "TRANSFERENCIA_ENTRADA" &&
          entrada.origem_id === r.id
            ? entrada.usuarios.nome
            : null,
      }),
    ),
  }
}
