import "server-only"
import { autorizar } from "./clientes.authorization"
import { ClienteError } from "./clientes.repository"
import {
  criarContato,
  criarEndereco,
  consultarContato,
  consultarEndereco,
  editarContato,
  editarEndereco,
  excluirContato,
  excluirEndereco,
  jsonBody,
  listarContatos,
  listarEnderecos,
  parseId,
} from "./clientes-vinculos"

type Colecao = "contatos" | "enderecos"
type ContextoRota = { params: Promise<{ id: string; idRegistro?: string }> }
const headers = { "Cache-Control": "no-store" }

async function executar(
  request: Request,
  colecao: Colecao,
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  context: ContextoRota,
) {
  try {
    const acao =
      metodo === "GET"
        ? "ler"
        : metodo === "POST"
          ? "criar"
          : metodo === "DELETE"
            ? "excluir"
            : "editar"
    const ctx = await autorizar(request, acao)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    const params = await context.params
    const idCliente = parseId(params.id)
    const idRegistro = params.idRegistro
      ? parseId(params.idRegistro)
      : undefined
    if (metodo === "POST" && idRegistro !== undefined)
      throw new ClienteError(404, "Rota não encontrada.")
    if ((metodo === "PATCH" || metodo === "DELETE") && idRegistro === undefined)
      throw new ClienteError(404, "Registro não encontrado.")

    const resultado =
      metodo === "GET"
        ? idRegistro !== undefined
          ? colecao === "contatos"
            ? await consultarContato(ctx, idCliente, idRegistro)
            : await consultarEndereco(ctx, idCliente, idRegistro)
          : colecao === "contatos"
            ? await listarContatos(ctx, idCliente)
            : await listarEnderecos(ctx, idCliente)
        : metodo === "POST"
          ? colecao === "contatos"
            ? await criarContato(ctx, idCliente, await jsonBody(request))
            : await criarEndereco(ctx, idCliente, await jsonBody(request))
          : metodo === "PATCH"
            ? colecao === "contatos"
              ? await editarContato(
                  ctx,
                  idCliente,
                  idRegistro!,
                  await jsonBody(request),
                )
              : await editarEndereco(
                  ctx,
                  idCliente,
                  idRegistro!,
                  await jsonBody(request),
                )
            : colecao === "contatos"
              ? await excluirContato(ctx, idCliente, idRegistro!)
              : await excluirEndereco(ctx, idCliente, idRegistro!)
    return Response.json(resultado, {
      status: metodo === "POST" ? 201 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof ClienteError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha na API de contatos e endereços", error)
    return Response.json({ error: "Erro interno" }, { status: 500, headers })
  }
}

export const listarContatosHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "contatos", "GET", context)
export const listarEnderecosHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "enderecos", "GET", context)
export const criarContatoHandler = (request: Request, context: ContextoRota) =>
  executar(request, "contatos", "POST", context)
export const editarContatoHandler = (request: Request, context: ContextoRota) =>
  executar(request, "contatos", "PATCH", context)
export const excluirContatoHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "contatos", "DELETE", context)
export const consultarContatoHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "contatos", "GET", context)
export const criarEnderecoHandler = (request: Request, context: ContextoRota) =>
  executar(request, "enderecos", "POST", context)
export const editarEnderecoHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "enderecos", "PATCH", context)
export const excluirEnderecoHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "enderecos", "DELETE", context)
export const consultarEnderecoHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "enderecos", "GET", context)
