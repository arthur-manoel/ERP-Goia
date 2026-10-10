import "server-only"
import { autorizar } from "./usuarios.authorization"
import { criarUsuarioSchema } from "./usuarios.schema"
import { cadastrarFuncionario } from "./usuarios.service"
import { UsuarioError } from "./usuarios.repository"

const headers = { "Cache-Control": "no-store" }
export async function criarHandler(request: Request) {
  try {
    const ctx = await autorizar(request)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new UsuarioError(400, "JSON inválido.")
    }
    const parsed = criarUsuarioSchema.safeParse(body)
    if (!parsed.success)
      throw new UsuarioError(
        400,
        parsed.error.issues[0]?.message ?? "Dados inválidos.",
      )
    return Response.json(await cadastrarFuncionario(ctx, parsed.data), {
      status: 201,
      headers,
    })
  } catch (error) {
    if (error instanceof UsuarioError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    // O objeto do driver pode conter parâmetros, inclusive o hash da senha.
    console.error("Falha na API de criação de usuários")
    return Response.json(
      { error: "Não foi possível cadastrar o funcionário." },
      { status: 500, headers },
    )
  }
}
