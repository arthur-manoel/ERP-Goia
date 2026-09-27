import "server-only"
import { Prisma, type clientes } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { ListarInput, PaginacaoInput } from "./clientes.schema"

export class ClienteError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409,
    message: string,
  ) {
    super(message)
  }
}
export type Contexto = {
  idUsuario: number
  idEmpresa: number
  podeExcluir: boolean
}
export type Transaction = Prisma.TransactionClient
export type Cliente = clientes

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
  // Contagem e página enxergam o mesmo snapshot, sem bloquear escritas como Serializable.
  return prisma.$transaction(operation, { isolationLevel: "RepeatableRead" })
}

export async function gravacao<T>(
  ctx: Contexto,
  operation: (tx: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Primeiro lock da transação: serializa todas as escritas destas rotas por empresa,
        // inclusive entre processos. NÃO é uma constraint: entradas externas podem furar
        // a regra. Dívida técnica: UNIQUE(id_empresa, cpf_cnpj), após saneamento dos legados.
        const empresas = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM empresas WHERE id = ${ctx.idEmpresa} AND status = 'ATIVA' FOR UPDATE
      `
        if (!empresas.length)
          throw new ClienteError(403, "Acesso negado à empresa.")
        return operation(tx)
      },
      { isolationLevel: "Serializable" },
    )
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2002", "P2034"].includes(error.code))
        throw new ClienteError(
          409,
          "Conflito de cadastro ou operação concorrente. Consulte o cliente e tente novamente.",
        )
      if (["P2003", "P2004", "P2025"].includes(error.code))
        throw new ClienteError(
          409,
          "Os dados relacionados foram alterados ou impedem esta operação.",
        )
    }
    throw error
  }
}

// Comparação também encontra documentos legados com máscara/espaços e letras minúsculas.
// SQL parametrizado; o documento nunca é interpolado como texto de comando.
export function idsPorDocumento(
  tx: Transaction,
  ctx: Contexto,
  documento: string,
) {
  return tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM clientes
    WHERE id_empresa = ${ctx.idEmpresa}
      AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '/', ''), '-', ''), ' ', '')) = ${documento}
  `
}

export async function garantirDocumentoUnico(
  tx: Transaction,
  ctx: Contexto,
  documento: string,
  id?: number,
) {
  const encontrados = await idsPorDocumento(tx, ctx, documento)
  if (encontrados.some((cliente) => cliente.id !== id))
    throw new ClienteError(409, "CPF/CNPJ já cadastrado nesta empresa.")
}

export async function buscarCliente(
  tx: Transaction,
  ctx: Contexto,
  id: number,
) {
  const cliente = await tx.clientes.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
  })
  if (!cliente) throw new ClienteError(404, "Cliente não encontrado.")
  return cliente
}

export function criarCliente(
  tx: Transaction,
  ctx: Contexto,
  data: Omit<
    Prisma.clientesUncheckedCreateInput,
    "id" | "id_empresa" | "data_cadastro" | "venda"
  >,
) {
  return tx.clientes.create({ data: { ...data, id_empresa: ctx.idEmpresa } })
}

export async function atualizarCliente(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  data: Prisma.clientesUpdateManyMutationInput,
) {
  const result = await tx.clientes.updateMany({
    where: { id, id_empresa: ctx.idEmpresa },
    data,
  })
  if (result.count !== 1)
    throw new ClienteError(409, "O cliente foi alterado por outra operação.")
  return buscarCliente(tx, ctx, id)
}

export async function listarClientes(
  tx: Transaction,
  ctx: Contexto,
  input: ListarInput,
) {
  const documentos = input.cpfCnpj
    ? await idsPorDocumento(tx, ctx, input.cpfCnpj)
    : undefined
  const where: Prisma.clientesWhereInput = {
    id_empresa: ctx.idEmpresa,
    // contains usa LIKE: escapar curingas para uma busca literal pelo nome informado.
    nome_razao_social: input.nome
      ? { contains: input.nome.replace(/[\\%_]/g, "\\$&") }
      : undefined,
    status: input.status,
    id: documentos ? { in: documentos.map((item) => item.id) } : undefined,
  }
  const total = await tx.clientes.count({ where })
  const clientes = await tx.clientes.findMany({
    where,
    orderBy: [{ nome_razao_social: "asc" }, { id: "asc" }],
    skip: (input.pagina - 1) * input.limite,
    take: input.limite,
  })
  return { clientes, total }
}

export async function listarPedidos(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  input: PaginacaoInput,
) {
  await buscarCliente(tx, ctx, id)
  // A FK de venda não garante que cliente e venda sejam da mesma empresa.
  const where = { id_cliente: id, id_empresa: ctx.idEmpresa }
  const total = await tx.venda.count({ where })
  const pedidos = await tx.venda.findMany({
    where,
    orderBy: [{ data_venda: "desc" }, { id: "desc" }],
    skip: (input.pagina - 1) * input.limite,
    take: input.limite,
    select: {
      id: true,
      numero: true,
      status: true,
      data_venda: true,
      data_entrega: true,
      valor_total: true,
    },
  })
  return { pedidos, total }
}

export function auditar(
  tx: Transaction,
  ctx: Contexto,
  antes: Cliente | null,
  depois: Cliente,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "clientes",
      id_registro: depois.id,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: antes ? JSON.stringify(antes) : null,
      dados_novos: JSON.stringify(depois),
    },
  })
}
