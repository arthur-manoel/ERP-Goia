import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"
import {
  listagemSetoresSchema,
  setorApiSchema,
  setorDetalheSchema,
  tiposSetorSchema,
  type DadosFormularioSetor,
  type FiltroStatus,
  type SetorApi,
} from "./tipos"
import { z } from "zod"

export type Requisitar = (url: string, init?: RequestInit) => Promise<Response>

/** Erro com o status HTTP, para a tela distinguir autorização de falha comum. */
export class ErroApiSetores extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function ler<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  if (!response.ok)
    throw new ErroApiSetores(await mensagemErro(response), response.status)
  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success)
    throw new ErroApiSetores("Resposta da API de setores inválida.", 502)
  return parsed.data
}

export async function listarSetores(
  requisitar: Requisitar,
  filtros: {
    busca: string
    status: FiltroStatus
    pagina: number
    limite: number
  },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    pagina: String(filtros.pagina),
    limite: String(filtros.limite),
  })
  if (filtros.busca.trim()) query.set("nome", filtros.busca.trim())
  if (filtros.status !== "TODOS") query.set("status", filtros.status)
  return ler(
    await requisitar(`/api/setores?${query}`, { signal }),
    listagemSetoresSchema,
  )
}

export async function consultarSetor(requisitar: Requisitar, id: number) {
  const dados = await ler(
    await requisitar(`/api/setores/${id}`),
    z.object({ setor: setorDetalheSchema }),
  )
  return dados.setor
}

const corpo = (valores: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(valores),
})

export async function criarSetor(
  requisitar: Requisitar,
  dados: DadosFormularioSetor,
): Promise<SetorApi> {
  const resposta = await requisitar("/api/setores", {
    method: "POST",
    ...corpo({
      nome: dados.nome,
      ...(dados.tipo ? { tipo: dados.tipo } : {}),
      descricao: dados.descricao || null,
      ativo: dados.ativo,
    }),
  })
  return (await ler(resposta, z.object({ setor: setorApiSchema }))).setor
}

/**
 * Envia apenas os campos alterados. Nunca reenvia `ativo`: inativar exige
 * permissão de exclusão e é feito por `alterarAtivoSetor`. `tipo` só vai quando
 * muda, pois alterá-lo exige perfil administrativo.
 */
export async function editarSetor(
  requisitar: Requisitar,
  atual: SetorApi,
  dados: DadosFormularioSetor,
): Promise<SetorApi> {
  const alteracoes: Record<string, unknown> = {}
  if (dados.nome !== atual.nome) alteracoes.nome = dados.nome
  if (dados.tipo && dados.tipo !== atual.tipo) alteracoes.tipo = dados.tipo
  if ((dados.descricao || null) !== atual.descricao)
    alteracoes.descricao = dados.descricao || null
  if (!Object.keys(alteracoes).length) return atual
  const resposta = await requisitar(`/api/setores/${atual.id}`, {
    method: "PATCH",
    ...corpo(alteracoes),
  })
  return (await ler(resposta, z.object({ setor: setorApiSchema }))).setor
}

export async function alterarAtivoSetor(
  requisitar: Requisitar,
  setor: SetorApi,
  ativo: boolean,
) {
  const resposta = await requisitar(`/api/setores/${setor.id}`, {
    method: "PATCH",
    ...corpo({ ativo }),
  })
  return (await ler(resposta, z.object({ setor: setorApiSchema }))).setor
}

export async function excluirSetor(requisitar: Requisitar, id: number) {
  const resposta = await requisitar(`/api/setores/${id}`, { method: "DELETE" })
  if (!resposta.ok)
    throw new ErroApiSetores(await mensagemErro(resposta), resposta.status)
}

export async function listarTiposSetor(requisitar: Requisitar) {
  return (await ler(await requisitar("/api/tipos_setor"), tiposSetorSchema))
    .tipos
}
