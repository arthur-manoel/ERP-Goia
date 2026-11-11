import { z } from "zod"
import { acoesAuditoria } from "@/modules/auditoria/schema"

const id = z.number().int().positive().max(2_147_483_647)
export const resultadoAuditoriaSchema = z.object({
  itens: z
    .array(
      z.object({
        id,
        id_empresa: id,
        data_evento: z.iso.datetime(),
        usuario: z.string(),
        id_usuario: id.nullable(),
        tabela: z.string(),
        id_registro: id.nullable(),
        acao: z.enum(acoesAuditoria),
        antes: z.json(),
        depois: z.json(),
      }),
    )
    .max(25),
  total: z.number().int().nonnegative(),
  pagina: id,
  totalPaginas: z.number().int().nonnegative(),
})
export type ResultadoAuditoria = z.infer<typeof resultadoAuditoriaSchema>
export type EventoAuditoria = ResultadoAuditoria["itens"][number]

export function validarResultadoAuditoria(
  body: unknown,
  idEmpresa: number,
  pagina: number,
): ResultadoAuditoria {
  const result = resultadoAuditoriaSchema.safeParse(body)
  if (
    !result.success ||
    result.data.pagina !== pagina ||
    result.data.itens.some((item) => item.id_empresa !== idEmpresa)
  )
    throw new Error(
      "Resposta de auditoria inválida ou incompatível com a consulta. Tente novamente.",
    )
  return result.data
}
