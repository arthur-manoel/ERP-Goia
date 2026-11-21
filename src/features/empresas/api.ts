import { z } from "zod"
import type { ParametrosListagem, ResultadoPagina } from "@/lib/listagem/tipos"
import { montarQuery } from "@/lib/listagem/parametros"
import {
  resumoEmpresaSchema,
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
async function indisponivel(): Promise<never> {
  throw new Error(
    "O cadastro de empresas aguarda a integração aprovada. Nenhum dado foi gravado.",
  )
}
// Sem HTTP, fixtures ou persistência local: ligar o transporte após aprovação do PR #155.
export const apiEmpresasPendente: ApiEmpresas = {
  listar: indisponivel,
  consultar: indisponivel,
  criar: indisponivel,
  editar: indisponivel,
  inativar: indisponivel,
  ativar: indisponivel,
}
