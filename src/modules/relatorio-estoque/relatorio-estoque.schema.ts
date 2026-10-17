import { z } from "zod"

const inteiro = (maximo = 2147483647) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(maximo))

export const filtrosRelatorioSchema = z.strictObject({
  id_local_estoque: inteiro().optional(),
  id_produto: inteiro().optional(),
  busca: z
    .string()
    .trim()
    .max(100)
    .transform((valor) => valor || undefined)
    .optional(),
  incluir_zerados: z
    .enum(["true", "false"])
    .default("true")
    .transform((valor) => valor === "true"),
  pagina: inteiro().default(1),
  limite: inteiro(100).default(25),
  ordenar_por: z
    .enum(["local", "produto", "quantidade_fisica"])
    .default("local"),
  direcao: z.enum(["asc", "desc"]).default("asc"),
})

export type FiltrosRelatorio = z.output<typeof filtrosRelatorioSchema>

export function validarFiltros(params: URLSearchParams) {
  if ([...params.keys()].some((key) => params.getAll(key).length > 1))
    return null
  const resultado = filtrosRelatorioSchema.safeParse(Object.fromEntries(params))
  return resultado.success ? resultado.data : null
}
