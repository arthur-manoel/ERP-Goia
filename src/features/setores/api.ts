import { z } from "zod"
import type {
  AlteracoesSetor,
  SetorApi,
  TipoSetor,
  ValoresSetor,
} from "./tipos"

export type Requisitar = (url: string, init?: RequestInit) => Promise<Response>

const idSchema = z.number().int().positive()
export const setorSchemaApi = z.object({
  id: idSchema,
  nome: z.string(),
  tipo: z.string(),
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  recursos: z.array(z.string()),
})
const permissoesSchema = z.object({
  ler: z.boolean(),
  criar: z.boolean(),
  editar: z.boolean(),
  excluir: z.boolean(),
})
export const metaSetoresSchema = z.object({
  permissoes: permissoesSchema,
  administrador: z.boolean(),
})
const tipoSchemaApi = z.object({
  id: idSchema,
  nome: z.string(),
  ativo: z.boolean(),
})

/** Toda chamada leva o X-Empresa-Id da empresa da tela; `requisitar` recusa se a ativa mudou. */
export function cabecalhosEmpresa(idEmpresa: number, json = false) {
  idSchema.max(2_147_483_647).parse(idEmpresa)
  return {
    "X-Empresa-Id": String(idEmpresa),
    ...(json ? { "Content-Type": "application/json" } : {}),
  }
}

function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const resultado = schema.safeParse(dados)
  if (!resultado.success) throw new Error("Resposta de setores inválida.")
  return resultado.data
}

async function lerResposta(resposta: Response): Promise<unknown> {
  const corpo: unknown = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    const mensagem =
      typeof corpo === "object" && corpo && "error" in corpo
        ? (corpo as { error: unknown }).error
        : undefined
    throw new Error(
      typeof mensagem === "string"
        ? mensagem
        : resposta.status === 403
          ? "Você não tem permissão para esta operação."
          : `Falha na requisição (${resposta.status}).`,
    )
  }
  return corpo
}

async function setorDaResposta(resposta: Response, idEsperado?: number) {
  const { setor } = validar(
    z.object({ setor: setorSchemaApi }),
    await lerResposta(resposta),
  )
  if (idEsperado !== undefined && setor.id !== idEsperado)
    throw new Error("Resposta de setores inválida.")
  return setor
}

export async function listarTipos(
  requisitar: Requisitar,
  idEmpresa: number,
  filtro?: { status?: "ATIVO" | "INATIVO"; sinal?: AbortSignal },
) {
  const query = filtro?.status ? `?status=${filtro.status}` : ""
  const dados = validar(
    z.object({ tipos: z.array(tipoSchemaApi) }),
    await lerResposta(
      await requisitar(`/api/tipos-setor${query}`, {
        signal: filtro?.sinal,
        headers: cabecalhosEmpresa(idEmpresa),
      }),
    ),
  )
  return dados.tipos satisfies TipoSetor[]
}

export async function criarSetor(
  requisitar: Requisitar,
  idEmpresa: number,
  valores: ValoresSetor,
) {
  const descricao = valores.descricao.trim()
  return setorDaResposta(
    await requisitar("/api/setores", {
      method: "POST",
      headers: cabecalhosEmpresa(idEmpresa, true),
      body: JSON.stringify({
        nome: valores.nome.trim(),
        tipo: valores.tipo,
        ...(descricao ? { descricao } : {}),
      }),
    }),
  )
}

export async function editarSetor(
  requisitar: Requisitar,
  idEmpresa: number,
  setor: SetorApi,
  alteracoes: AlteracoesSetor,
) {
  if (!Object.keys(alteracoes).length)
    throw new Error("Nenhuma alteração para salvar.")
  return setorDaResposta(
    await requisitar(`/api/setores/${setor.id}`, {
      method: "PATCH",
      headers: cabecalhosEmpresa(idEmpresa, true),
      body: JSON.stringify(alteracoes),
    }),
    setor.id,
  )
}

/** Inativar/reativar: único caminho que envia `ativo`. */
export async function alterarStatusSetor(
  requisitar: Requisitar,
  idEmpresa: number,
  setor: SetorApi,
  ativo: boolean,
) {
  return setorDaResposta(
    await requisitar(`/api/setores/${setor.id}`, {
      method: "PATCH",
      headers: cabecalhosEmpresa(idEmpresa, true),
      body: JSON.stringify({ ativo }),
    }),
    setor.id,
  )
}

export async function substituirRecursos(
  requisitar: Requisitar,
  idEmpresa: number,
  setor: SetorApi,
  recursos: string[],
) {
  return setorDaResposta(
    await requisitar(`/api/setores/${setor.id}/recursos`, {
      method: "PUT",
      headers: cabecalhosEmpresa(idEmpresa, true),
      body: JSON.stringify({ recursos }),
    }),
    setor.id,
  )
}

export async function criarTipo(
  requisitar: Requisitar,
  idEmpresa: number,
  nome: string,
) {
  const { tipo } = validar(
    z.object({ tipo: tipoSchemaApi }),
    await lerResposta(
      await requisitar("/api/tipos-setor", {
        method: "POST",
        headers: cabecalhosEmpresa(idEmpresa, true),
        body: JSON.stringify({ nome: nome.trim() }),
      }),
    ),
  )
  return tipo
}

export async function alterarStatusTipo(
  requisitar: Requisitar,
  idEmpresa: number,
  tipo: TipoSetor,
  ativo: boolean,
) {
  const { tipo: salvo } = validar(
    z.object({ tipo: tipoSchemaApi }),
    await lerResposta(
      await requisitar(`/api/tipos-setor/${tipo.id}`, {
        method: "PATCH",
        headers: cabecalhosEmpresa(idEmpresa, true),
        body: JSON.stringify({ ativo }),
      }),
    ),
  )
  return salvo
}
