import { z } from "zod"
import type { ParametrosListagem, ResultadoPagina } from "@/lib/listagem/tipos"
import { montarQuery } from "@/lib/listagem/parametros"
import {
  resumoEmpresaSchema,
  empresaSchema,
  cadastroEmpresaSchema,
  edicaoEmpresaSchema,
  type DadosEmpresa,
  type EdicaoEmpresa,
  type Empresa,
  type ResumoEmpresa,
} from "./schemas"

export type ApiEmpresas = {
  listar: (
    parametros: ParametrosListagem,
    signal: AbortSignal,
  ) => Promise<ResultadoPagina<ResumoEmpresa>>
  consultar: (id: number, signal: AbortSignal) => Promise<Empresa>
  criar: (dados: DadosEmpresa) => Promise<void>
  editar: (id: number, dados: EdicaoEmpresa) => Promise<void>
  inativar: (id: number) => Promise<void>
  ativar: (id: number) => Promise<void>
}
export function queryEmpresas(parametros: ParametrosListagem) {
  return montarQuery(parametros, {
    pagina: "page",
    limite: "limit",
    busca: "search",
    ordenarPor: "sortBy",
    direcao: "sortOrder",
  }).toString()
}
export function normalizarEmpresas(
  corpo: unknown,
): ResultadoPagina<ResumoEmpresa> {
  const { data } = z
    .object({
      success: z.literal(true),
      data: z.object({
        data: z.array(resumoEmpresaSchema),
        page: z.number().int().positive(),
        limit: z.number().int().min(1).max(100),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      }),
    })
    .parse(corpo)
  return {
    itens: data.data,
    pagina: data.page,
    limite: data.limit,
    total: data.total,
    totalPaginas: Math.max(1, data.totalPages),
    meta: undefined,
  }
}
export type RequisitarEmpresas = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export function criarApiEmpresas(requisitar: RequisitarEmpresas): ApiEmpresas {
  const idValido = z.number().int().positive().max(2_147_483_647)
  async function ler(url: string, init?: RequestInit) {
    const resposta = await requisitar(url, init)
    const corpo: unknown = await resposta.json().catch(() => null)
    if (!resposta.ok) {
      const erro = z.object({ error: z.string() }).safeParse(corpo)
      throw new Error(
        erro.success
          ? erro.data.error
          : `Não foi possível concluir a operação (${resposta.status}).`,
      )
    }
    return corpo
  }
  function rota(id: number) {
    return `/api/empresas/${idValido.parse(id)}`
  }
  async function gravar(url: string, metodo: string, dados?: unknown) {
    const corpo = await ler(url, {
      method: metodo,
      ...(dados === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados),
          }),
    })
    const resultado = z
      .object({ success: z.literal(true), data: empresaSchema })
      .safeParse(corpo)
    if (!resultado.success)
      throw new Error(
        "A gravação pode ter sido concluída, mas a resposta não foi confirmada. Atualize a lista antes de tentar novamente.",
      )
  }
  return {
    listar: async (parametros, signal) =>
      normalizarEmpresas(
        await ler(`/api/empresas?${queryEmpresas(parametros)}`, { signal }),
      ),
    consultar: async (id, signal) => {
      const resultado = z
        .object({ success: z.literal(true), data: empresaSchema })
        .parse(await ler(rota(id), { signal }))
      if (resultado.data.id !== id)
        throw new Error("Empresa retornada fora do cadastro consultado.")
      return resultado.data
    },
    criar: (dados) =>
      gravar("/api/empresas", "POST", cadastroEmpresaSchema.parse(dados)),
    editar: async (id, dados) => {
      const validados = edicaoEmpresaSchema.parse(dados)
      if (Object.keys(validados).length)
        await gravar(rota(id), "PATCH", validados)
    },
    inativar: (id) => gravar(rota(id), "DELETE"),
    ativar: (id) => gravar(rota(id), "PATCH", { status: "ATIVA" }),
  }
}
