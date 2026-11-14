import { z } from "zod"
import {
  RECURSOS_PERMISSAO,
  type AcaoPermissao,
  type RecursoPermissao,
} from "@/lib/permissoes"

const id = z.number().int().positive()
const permissao = z.object({
  id: id.optional(),
  id_usuario_empresa: id,
  recurso: z.enum(RECURSOS_PERMISSAO),
  pode_ler: z.boolean(),
  pode_criar: z.boolean(),
  pode_editar: z.boolean(),
  pode_excluir: z.boolean(),
})
const vinculo = z.object({
  id: id,
  id_empresa: id,
  id_cargo: id,
  id_setor: id.nullable(),
  nivel_acesso: z.string(),
  status: z.enum(["ATIVO", "INATIVO"]),
  empresas: z.object({ status: z.string() }).optional(),
  cargos: z.object({ nome: z.string(), status: z.string() }),
  setores: z
    .object({ nome: z.string(), tipo: z.string(), status: z.string() })
    .nullable(),
  permissoes_usuario: z.array(permissao),
})
const usuario = z.object({
  id,
  nome: z.string(),
  email: z.string().email(),
  status: z.enum(["ATIVO", "INATIVO"]),
  data_cadastro: z.iso.datetime(),
  _count: z.object({ usuario_empresa: z.number().int().nonnegative() }),
  usuario_empresa: z.array(vinculo),
})
const opcoesSchema = z.object({
  cargos: z.array(z.object({ id, nome: z.string(), status: z.string() })),
  setores: z.array(
    z.object({ id, nome: z.string(), tipo: z.string(), status: z.string() }),
  ),
})
const paginacaoSchema = z.object({
  pagina: id,
  limite: id,
  total: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
})

export type UsuarioAdmin = z.infer<typeof usuario>
export type VinculoAdmin = z.infer<typeof vinculo>
export type OpcaoUsuario = z.infer<typeof opcoesSchema>
export type PermissoesUsuario = Record<
  RecursoPermissao,
  Record<AcaoPermissao, boolean>
>
export type FiltroUsuarios = {
  busca: string
  status: "TODOS" | "ATIVO" | "INATIVO"
  idCargo: string
  idSetor: string
  pagina: number
}
export const filtrosUsuariosIniciais: FiltroUsuarios = {
  busca: "",
  status: "TODOS",
  idCargo: "",
  idSetor: "",
  pagina: 1,
}
export const acoesPermissao: AcaoPermissao[] = [
  "pode_ler",
  "pode_criar",
  "pode_editar",
  "pode_excluir",
]
export const rotulosAcoes: Record<AcaoPermissao, string> = {
  pode_ler: "Ler",
  pode_criar: "Criar",
  pode_editar: "Editar",
  pode_excluir: "Excluir",
}

export type RequisitarUsuarios = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

async function requisicao<T>(
  requisitar: RequisitarUsuarios,
  url: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await requisitar(url, init)
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = body as { error?: unknown } | null
    throw new Error(
      typeof error?.error === "string"
        ? error.error
        : `Falha na requisição (${response.status}).`,
    )
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success)
    throw new Error("Resposta de usuários inválida. Tente novamente.")
  return parsed.data
}

function urlUsuarios(filtros: FiltroUsuarios) {
  const query = new URLSearchParams({
    pagina: String(filtros.pagina),
    limite: "20",
    status: filtros.status,
    ...(filtros.busca.trim() ? { busca: filtros.busca.trim() } : {}),
    ...(filtros.idCargo ? { idCargo: filtros.idCargo } : {}),
    ...(filtros.idSetor ? { idSetor: filtros.idSetor } : {}),
  })
  return `/api/usuarios?${query}`
}

export async function listarUsuarios(
  requisitar: RequisitarUsuarios,
  filtros: FiltroUsuarios,
  signal?: AbortSignal,
) {
  return requisicao(
    requisitar,
    urlUsuarios(filtros),
    z.object({
      usuarios: z.array(usuario),
      paginacao: paginacaoSchema,
      cargos: opcoesSchema.shape.cargos,
      setores: opcoesSchema.shape.setores,
    }),
    { signal },
  )
}

const usuarioResponse = z.object({ usuario: z.object({ id }) })
const okResponse = z.object({ ok: z.literal(true) })
const permissoesResponse = z.object({
  idUsuario: id,
  permissoes: z.array(permissao),
})
function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}
export const criarUsuario = (requisitar: RequisitarUsuarios, body: unknown) =>
  requisicao(requisitar, "/api/usuarios", usuarioResponse, json("POST", body))
export const vincularUsuario = (
  requisitar: RequisitarUsuarios,
  body: unknown,
) =>
  requisicao(
    requisitar,
    "/api/usuarios/vinculos",
    usuarioResponse,
    json("POST", body),
  )
export const editarUsuario = (
  requisitar: RequisitarUsuarios,
  idUsuario: number,
  body: unknown,
) =>
  requisicao(
    requisitar,
    `/api/usuarios/${idUsuario}`,
    usuarioResponse,
    json("PATCH", body),
  )
export const inativarVinculo = (
  requisitar: RequisitarUsuarios,
  idUsuario: number,
) =>
  requisicao(requisitar, `/api/usuarios/${idUsuario}`, usuarioResponse, {
    method: "DELETE",
  })
export const atualizarPermissoes = (
  requisitar: RequisitarUsuarios,
  idUsuario: number,
  body: unknown,
) =>
  requisicao(
    requisitar,
    `/api/usuarios/${idUsuario}/permissoes`,
    permissoesResponse,
    json("PUT", body),
  )
export const redefinirSenha = (
  requisitar: RequisitarUsuarios,
  idUsuario: number,
  password: string,
) =>
  requisicao(
    requisitar,
    `/api/usuarios/${idUsuario}/senha`,
    okResponse,
    json("PATCH", { password }),
  )
export const trocarMinhaSenha = (
  requisitar: RequisitarUsuarios,
  currentPassword: string,
  password: string,
) =>
  requisicao(
    requisitar,
    "/api/usuarios/senha",
    okResponse,
    json("POST", { currentPassword, password }),
  )
