import { z } from "zod"
import { permissoes_usuario_recurso } from "@/generated/prisma/enums"
import { idSchema } from "../producao/producao.schema"
export { idSchema }
const campos = {
  nome: z.string().trim().min(1).max(100),
  descricao: z.string().trim().max(255).nullable().optional(),
  ativo: z.boolean().optional(),
}
// `tipo` referencia o nome de um registro ativo de `tipos_setor` da empresa
// (setores.tipo é texto livre no banco; a validação é feita no serviço).
export const setorSchema = z.strictObject({
  ...campos,
  tipo: z.string().trim().min(1).max(80).optional(),
})
export const editarSetorSchema = setorSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe dados para alteração.")
export const setoresSchema = z
  .array(idSchema)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, "Não repita setores.")
export const fluxoSchema = z.strictObject({ ...campos, setores: setoresSchema })
export const editarFluxoSchema = fluxoSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe dados para alteração.")
const inteiro = (padrao: string, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(padrao)
    .transform(Number)
    .pipe(z.number().int().max(max))
export const listarSchema = z.strictObject({
  pagina: inteiro("1", 2147483647),
  limite: inteiro("20", 100),
  nome: z.string().trim().min(1).max(100).optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
})
export const recursosSetorSchema = z.strictObject({
  recursos: z
    .array(z.enum(permissoes_usuario_recurso))
    .max(50)
    .refine((v) => new Set(v).size === v.length, "Não repita recursos."),
})
export const associarSchema = z.strictObject({ fluxoId: idSchema })
export const etapaSchema = z.strictObject({ etapaId: idSchema })
export type Cadastro = z.infer<typeof setorSchema>
export type Edicao = z.infer<typeof editarFluxoSchema> & { tipo?: string }
export type Listagem = z.infer<typeof listarSchema>
