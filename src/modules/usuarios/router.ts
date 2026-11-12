import "server-only"
import { requireRole } from "@/lib/authorize"
import { autorizar } from "./usuarios.authorization"
import {
  editarPermissoesSchema,
  editarUsuarioSchema,
  listarUsuariosSchema,
  redefinirSenhaSchema,
  trocarSenhaSchema,
  criarUsuarioSchema,
  vincularUsuarioSchema,
} from "./usuarios.schema"
import {
  atualizarPermissoesFuncionario,
  cadastrarFuncionario,
  editarFuncionario,
  inativarFuncionario,
  listarFuncionarios,
  possuiVinculoAtivo,
  redefinirSenhaFuncionario,
  trocarMinhaSenha,
  vincularFuncionario,
} from "./usuarios.service"
import { UsuarioError } from "./usuarios.repository"

const headers = { "Cache-Control": "private, no-store" }
type ContextoRota = { params: Promise<{ id: string }> }
type Operacao =
  | "listar"
  | "criar"
  | "vincular"
  | "editar"
  | "inativar"
  | "permissoes"
  | "redefinirSenha"
  | "trocarMinhaSenha"

function idDaRota(value: string) {
  if (!/^[1-9]\d{0,9}$/.test(value))
    throw new UsuarioError(400, "Identificador inválido.")
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id > 2147483647)
    throw new UsuarioError(400, "Identificador inválido.")
  return id
}

function queryDaUrl(request: Request) {
  const result: Record<string, string> = Object.create(null)
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key))
      throw new UsuarioError(400, "Não repita parâmetros de busca.")
    result[key] = value
  }
  return result
}

async function jsonDaRequisicao(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch {
    throw new UsuarioError(400, "JSON inválido.")
  }
}

function validar<T>(
  schema: {
    safeParse(
      value: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } }
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new UsuarioError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}

async function executar(
  request: Request,
  operacao: Operacao,
  context?: ContextoRota,
) {
  try {
    if (operacao === "trocarMinhaSenha") {
      const auth = await requireRole(request, [
        "ADMINISTRACAO",
        "PRODUCAO",
        "VENDAS",
        "FINANCEIRO",
      ])
      if (auth.error) {
        auth.error.headers.set("Cache-Control", "no-store")
        return auth.error
      }
      const idUsuario = Number(auth.user.id)
      if (
        !Number.isSafeInteger(idUsuario) ||
        idUsuario <= 0 ||
        idUsuario > 2147483647
      )
        throw new UsuarioError(401, "Não autenticado.")
      if (!(await possuiVinculoAtivo(idUsuario)))
        throw new UsuarioError(
          403,
          "É necessário ter vínculo ativo com uma empresa.",
        )
      const input = validar(trocarSenhaSchema, await jsonDaRequisicao(request))
      return Response.json(
        await trocarMinhaSenha(
          idUsuario,
          input.currentPassword,
          input.password,
        ),
        { headers },
      )
    }

    const ctx = await autorizar(request)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    const id = context ? idDaRota((await context.params).id) : undefined
    const result =
      operacao === "listar"
        ? await listarFuncionarios(
            ctx,
            validar(listarUsuariosSchema, queryDaUrl(request)),
          )
        : operacao === "criar"
          ? await cadastrarFuncionario(
              ctx,
              validar(criarUsuarioSchema, await jsonDaRequisicao(request)),
            )
          : operacao === "vincular"
            ? await vincularFuncionario(
                ctx,
                validar(vincularUsuarioSchema, await jsonDaRequisicao(request)),
              )
            : operacao === "editar"
              ? await editarFuncionario(
                  ctx,
                  id!,
                  validar(editarUsuarioSchema, await jsonDaRequisicao(request)),
                )
              : operacao === "inativar"
                ? await inativarFuncionario(ctx, id!)
                : operacao === "permissoes"
                  ? await atualizarPermissoesFuncionario(
                      ctx,
                      id!,
                      validar(
                        editarPermissoesSchema,
                        await jsonDaRequisicao(request),
                      ).permissoes,
                    )
                  : await redefinirSenhaFuncionario(
                      ctx,
                      id!,
                      validar(
                        redefinirSenhaSchema,
                        await jsonDaRequisicao(request),
                      ).password,
                    )
    return Response.json(result, {
      status: operacao === "criar" || operacao === "vincular" ? 201 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof UsuarioError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    // Evite serializar erros do driver: os parâmetros podem conter hashes de senha.
    console.error("Falha na API de usuários")
    return Response.json(
      { error: "Não foi possível concluir a operação de usuários." },
      { status: 500, headers },
    )
  }
}

export const listarHandler = (request: Request) => executar(request, "listar")
export const criarHandler = (request: Request) => executar(request, "criar")
export const vincularHandler = (request: Request) =>
  executar(request, "vincular")
export const editarHandler = (request: Request, context: ContextoRota) =>
  executar(request, "editar", context)
export const inativarHandler = (request: Request, context: ContextoRota) =>
  executar(request, "inativar", context)
export const permissoesHandler = (request: Request, context: ContextoRota) =>
  executar(request, "permissoes", context)
export const redefinirSenhaHandler = (
  request: Request,
  context: ContextoRota,
) => executar(request, "redefinirSenha", context)
export const trocarMinhaSenhaHandler = (request: Request) =>
  executar(request, "trocarMinhaSenha")
