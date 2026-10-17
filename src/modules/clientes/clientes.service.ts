import "server-only"
import { inferirTipoPessoa } from "./clientes.documento"
import * as repository from "./clientes.repository"
import type { Cliente, Contexto } from "./clientes.repository"
import type {
  CriarInput,
  EditarInput,
  ListarInput,
  PaginacaoInput,
} from "./clientes.schema"

function apresentar(cliente: Cliente) {
  return { ...cliente, tipoPessoa: inferirTipoPessoa(cliente.cpf_cnpj) }
}
function paginacao(input: PaginacaoInput, total: number) {
  return {
    pagina: input.pagina,
    limite: input.limite,
    total,
    totalPaginas: Math.ceil(total / input.limite),
  }
}
function campos(input: EditarInput) {
  return {
    nome_razao_social: input.nomeRazaoSocial,
    cpf_cnpj: input.cpfCnpj,
    email: input.email,
    telefone: input.telefone,
    endereco: input.endereco,
    numero: input.numero,
    complemento: input.complemento,
    bairro: input.bairro,
    cidade: input.cidade,
    estado: input.estado,
    cep: input.cep,
    status: input.status,
  }
}
function autorizarInativacao(ctx: Contexto, status?: string) {
  // VENDAS pode inativar com pode_excluir. Vale também para POST/PATCH, para que
  // enviar status INATIVO não contorne a autorização do DELETE.
  if (status === "INATIVO" && !ctx.podeExcluir)
    throw new repository.ClienteError(
      403,
      "Sem permissão para inativar clientes.",
    )
}

export function cadastrarCliente(ctx: Contexto, input: CriarInput) {
  autorizarInativacao(ctx, input.status)
  return repository.gravacao(ctx, async (tx) => {
    if (input.cpfCnpj)
      await repository.garantirDocumentoUnico(tx, ctx, input.cpfCnpj)
    const cliente = await repository.criarCliente(tx, ctx, {
      ...campos(input),
      nome_razao_social: input.nomeRazaoSocial,
    })
    await repository.auditar(tx, ctx, null, cliente)
    return { cliente: apresentar(cliente) }
  })
}
export function editarCliente(ctx: Contexto, id: number, input: EditarInput) {
  autorizarInativacao(ctx, input.status)
  return repository.gravacao(ctx, async (tx) => {
    const antes = await repository.buscarCliente(tx, ctx, id)
    if (input.cpfCnpj)
      await repository.garantirDocumentoUnico(tx, ctx, input.cpfCnpj, id)
    const cliente = await repository.atualizarCliente(
      tx,
      ctx,
      id,
      campos(input),
    )
    await repository.auditar(tx, ctx, antes, cliente)
    return { cliente: apresentar(cliente) }
  })
}
export function inativarCliente(ctx: Contexto, id: number) {
  return editarCliente(ctx, id, { status: "INATIVO" })
}
export function consultarCliente(ctx: Contexto, id: number) {
  return repository.leitura(async (tx) => ({
    cliente: apresentar(await repository.buscarCliente(tx, ctx, id)),
  }))
}
export function buscarClientes(ctx: Contexto, input: ListarInput) {
  return repository.leitura(async (tx) => {
    const { clientes, total } = await repository.listarClientes(tx, ctx, input)
    return {
      clientes: clientes.map(apresentar),
      paginacao: paginacao(input, total),
    }
  })
}
export function historicoPedidos(
  ctx: Contexto,
  id: number,
  input: PaginacaoInput,
) {
  return repository.leitura(async (tx) => {
    const { pedidos, total } = await repository.listarPedidos(
      tx,
      ctx,
      id,
      input,
    )
    return {
      idCliente: id,
      pedidos: pedidos.map((pedido) => ({
        ...pedido,
        valor_total: pedido.valor_total.toFixed(2),
      })),
      paginacao: paginacao(input, total),
    }
  })
}
