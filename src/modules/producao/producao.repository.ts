import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export class ProducaoError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export type Contexto = { idUsuario: number; idEmpresa: number }
export type Transaction = Prisma.TransactionClient

const include = {
  ordem_producao_item: { include: { ordem_producao_consumo_planejado: true } },
  ordem_producao_fluxo_setor: { orderBy: { ordem: "asc" as const } },
  ordem_producao_movimentacao_setor: { orderBy: { id: "asc" as const } },
} satisfies Prisma.ordem_producaoInclude
export type Ordem = Prisma.ordem_producaoGetPayload<{ include: typeof include }>

export function vinculosAtivos(idUsuario: number) {
  return prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    include: {
      permissoes_usuario: true,
      usuarios: { select: { nivel_acesso: true } },
    },
  })
}
export async function transacao<T>(operation: (tx: Transaction) => Promise<T>) {
  try {
    // Serializable protege também edição/recalculo e o histórico de setores.
    // Não repetir automaticamente uma transação que perdeu a disputa de estado.
    return await prisma.$transaction(operation, {
      isolationLevel: "Serializable",
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2034", "P2002"].includes(error.code))
        throw new ProducaoError(
          409,
          "Conflito concorrente. Atualize a ordem antes de tentar novamente.",
        )
      if (["P2003", "P2004", "P2025"].includes(error.code))
        throw new ProducaoError(
          409,
          "Os dados relacionados foram alterados ou impedem esta operação.",
        )
    }
    throw error
  }
}
export async function buscarOrdem(tx: Transaction, ctx: Contexto, id: number) {
  const ordem = await tx.ordem_producao.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include,
  })
  if (!ordem) throw new ProducaoError(404, "Ordem de produção não encontrada.")
  return ordem
}
export async function atualizarEstado(
  tx: Transaction,
  ctx: Contexto,
  ordem: Ordem,
  data: Prisma.ordem_producaoUncheckedUpdateManyInput,
) {
  const result = await tx.ordem_producao.updateMany({
    // Lock otimista: o UPDATE só vence se status E setor ainda forem os lidos.
    where: {
      id: ordem.id,
      id_empresa: ctx.idEmpresa,
      status: ordem.status,
      id_setor: ordem.id_setor,
    },
    data,
  })
  if (result.count !== 1)
    throw new ProducaoError(409, "A ordem foi alterada por outra operação.")
}
export async function proximoNumero(tx: Transaction, idEmpresa: number) {
  const sequence = await tx.sequencias_automaticas.upsert({
    where: {
      id_empresa_entidade: {
        id_empresa: idEmpresa,
        entidade: "ordem_producao",
      },
    },
    create: {
      id_empresa: idEmpresa,
      entidade: "ordem_producao",
      ultimo_numero: BigInt(1),
    },
    update: { ultimo_numero: { increment: BigInt(1) } },
  })
  return sequence.ultimo_numero.toString()
}
export async function auditar(
  tx: Transaction,
  ctx: Contexto,
  antes: Ordem | null,
  depois: Ordem,
) {
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "ordem_producao",
      id_registro: depois.id,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: antes ? JSON.stringify(antes) : null,
      dados_novos: JSON.stringify({
        ...depois,
        perdaAplicada: false,
        baixaEstoque: "pendente",
      }),
    },
  })
}
export async function produtoComFicha(
  tx: Transaction,
  ctx: Contexto,
  idProduto: number,
) {
  const produto = await tx.produto_empresa.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: idProduto,
      status: "ATIVO",
      produtos: { status: "ATIVO", permite_producao: true },
    },
  })
  if (!produto)
    throw new ProducaoError(
      400,
      "Selecione um produto ativo habilitado para produção nesta empresa.",
    )
  const ficha = await tx.ficha_tecnica.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: idProduto,
      status: "ATIVA",
      OR: [{ data_vigencia: null }, { data_vigencia: { lte: new Date() } }],
    },
    orderBy: { versao: "desc" },
    include: { ficha_tecnica_item: true },
  })
  if (!ficha?.ficha_tecnica_item.length)
    throw new ProducaoError(
      400,
      "O produto precisa de ficha técnica ativa, vigente e com componentes.",
    )
  const ids = ficha.ficha_tecnica_item.map((item) => item.id_produto_componente)
  const componentes = await tx.produto_empresa.count({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: { in: ids },
      status: "ATIVO",
      produtos: { status: "ATIVO" },
    },
  })
  if (componentes !== ids.length)
    throw new ProducaoError(
      400,
      "A ficha contém componentes inativos ou não vinculados à empresa.",
    )
  return ficha
}
