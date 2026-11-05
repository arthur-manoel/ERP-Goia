import { z } from "zod"
import { permissoes_usuario_recurso } from "@/generated/prisma/enums"

/** Contrato real de /api/setores (ver modules/fluxos/fluxos.service.ts). */
export const setorApiSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string(),
  tipo: z.string().optional(),
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export const setorDetalheSchema = setorApiSchema.extend({
  recursos: z.array(z.string()).default([]),
})
export const paginacaoSchema = z.object({
  pagina: z.number().int().positive(),
  limite: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPaginas: z.number().int().nonnegative(),
})
export const listagemSetoresSchema = z.object({
  setores: z.array(setorApiSchema),
  paginacao: paginacaoSchema,
})
export const tiposSetorSchema = z.object({
  tipos: z.array(
    z.object({ id: z.number().int().positive(), nome: z.string() }),
  ),
})

export type SetorApi = z.infer<typeof setorApiSchema>
export type SetorDetalhe = z.infer<typeof setorDetalheSchema>
export type TipoSetor = z.infer<typeof tiposSetorSchema>["tipos"][number]
export type Paginacao = z.infer<typeof paginacaoSchema>
export type FiltroStatus = "TODOS" | "ATIVO" | "INATIVO"

export const recursosDisponiveis = Object.values(permissoes_usuario_recurso)

/** Estado do formulário (texto como digitado). */
export type DadosFormularioSetor = {
  nome: string
  tipo: string
  descricao: string
  ativo: boolean
}
