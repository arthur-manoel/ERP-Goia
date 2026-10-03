import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export class ComprasError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}

export type Acao = "ler" | "criar" | "editar" | "excluir"
export type Contexto = {
  idUsuario: number
  idEmpresa: number
  /** Permissões efetivas no recurso da área (admin/vínculo EMPRESA têm todas). */
  pode: Record<Acao, boolean>
}
export type Transaction = Prisma.TransactionClient

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

export function leitura<T>(operation: (tx: Transaction) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: "RepeatableRead" })
}

/**
 * Escritas serializadas por empresa (lock na linha da empresa), na mesma estratégia dos demais módulos.
 * Garante, entre processos, que duas conversões simultâneas da mesma solicitação/pedido não passem.
 */
export async function gravacao<T>(
  ctx: Contexto,
  operation: (tx: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const empresas = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} AND status = 'ATIVA' FOR UPDATE
        `
        if (!empresas.length)
          throw new ComprasError(403, "Acesso negado à empresa.")
        return operation(tx)
      },
      { isolationLevel: "Serializable" },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2002", "P2034"].includes(error.code))
        throw new ComprasError(
          409,
          "Conflito de cadastro ou operação concorrente. Atualize a tela e tente novamente.",
        )
      if (["P2003", "P2004", "P2025"].includes(error.code))
        throw new ComprasError(
          409,
          "Os dados relacionados foram alterados ou impedem esta operação.",
        )
    }
    throw error
  }
}

const prefixos = {
  requisicao_compra: "SC",
  pedido_compra: "PC",
  compras: "CP",
} as const
export type EntidadeNumerada = keyof typeof prefixos

/** Próximo número sequencial por empresa/entidade, ex.: SC-000012. Usar dentro de `gravacao`. */
export async function proximoNumero(
  tx: Transaction,
  idEmpresa: number,
  entidade: EntidadeNumerada,
) {
  const sequencia = await tx.sequencias_automaticas.upsert({
    where: { id_empresa_entidade: { id_empresa: idEmpresa, entidade } },
    create: { id_empresa: idEmpresa, entidade, ultimo_numero: BigInt(1) },
    update: { ultimo_numero: { increment: BigInt(1) } },
  })
  return `${prefixos[entidade]}-${sequencia.ultimo_numero.toString().padStart(6, "0")}`
}

export function auditar(
  tx: Transaction,
  ctx: Contexto,
  tabela: string,
  idRegistro: number,
  antes: unknown | null,
  depois: unknown,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: idRegistro,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: antes ? JSON.stringify(antes) : null,
      dados_novos: JSON.stringify(depois),
    },
  })
}

// ------------------------------------------------- escopo de empresa (tenant)

export const fornecedorDaEmpresa = (idEmpresa: number): Prisma.fornecedoresWhereInput => ({
  status: "ATIVO",
  OR: [
    { id_empresa: idEmpresa },
    { empresa_fornecedor: { some: { id_empresa: idEmpresa, status: "ATIVO" } } },
  ],
})

export const insumoDaEmpresa = (idEmpresa: number): Prisma.produtosWhereInput => ({
  status: "ATIVO",
  permite_compra: true,
  produto_empresa: { some: { id_empresa: idEmpresa, status: "ATIVO" } },
})

export async function exigirFornecedor(tx: Transaction, ctx: Contexto, id: number) {
  const fornecedor = await tx.fornecedores.findFirst({
    where: { id, ...fornecedorDaEmpresa(ctx.idEmpresa) },
    select: { id: true },
  })
  if (!fornecedor) throw new ComprasError(400, "Selecione um fornecedor ativo da empresa.")
}

export async function exigirLocal(tx: Transaction, ctx: Contexto, id: number) {
  const local = await tx.locais_estoque.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true },
  })
  if (!local) throw new ComprasError(400, "Selecione um local de estoque ativo.")
}

export async function exigirSetor(tx: Transaction, ctx: Contexto, id: number) {
  const setor = await tx.setores.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true },
  })
  if (!setor) throw new ComprasError(400, "Selecione um setor ativo da empresa.")
}

/** Todos os produtos devem ser insumos/materiais compráveis e ativos na empresa. */
export async function exigirInsumos(tx: Transaction, ctx: Contexto, ids: number[]) {
  const unicos = [...new Set(ids)]
  const encontrados = await tx.produtos.count({
    where: { id: { in: unicos }, ...insumoDaEmpresa(ctx.idEmpresa) },
  })
  if (encontrados !== unicos.length)
    throw new ComprasError(
      400,
      "Há itens que não são insumos ativos habilitados para compra nesta empresa.",
    )
}

export function escaparLike(texto: string) {
  return texto.replace(/[\\%_]/g, "\\$&")
}

export function paginar(pagina: number, limite: number) {
  return { skip: (pagina - 1) * limite, take: limite }
}

export function paginacao(pagina: number, limite: number, total: number) {
  return { pagina, limite, total, totalPaginas: Math.ceil(total / limite) }
}

/** Intervalo [de, ate] em dias (YYYY-MM-DD), inclusivo, interpretado em UTC. */
export function intervaloDatas(de?: string, ate?: string) {
  if (!de && !ate) return undefined
  return {
    gte: de ? new Date(`${de}T00:00:00.000Z`) : undefined,
    lt: ate ? new Date(new Date(`${ate}T00:00:00.000Z`).getTime() + 86_400_000) : undefined,
  }
}
