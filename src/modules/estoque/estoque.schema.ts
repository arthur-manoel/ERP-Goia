import { z } from "zod"

const intMaximo = 2147483647
const inteiroQuery = (maximo = intMaximo) =>
  z
    .string()
    .max(10)
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(maximo))

export const idEstoqueSchema = inteiroQuery()

export const filtrosEstoqueSchema = z.strictObject({
  id_produto: inteiroQuery().optional(),
  id_local_estoque: inteiroQuery().optional(),
  id_setor: inteiroQuery().optional(),
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
  pagina: inteiroQuery().default(1),
  limite: inteiroQuery(100).default(25),
})

const idCorpo = z.number().int().min(1).max(intMaximo)
export const criarVinculoSchema = z.strictObject({
  idProduto: idCorpo,
  idLocalEstoque: idCorpo,
  idSetor: idCorpo,
})

export type FiltrosEstoque = z.output<typeof filtrosEstoqueSchema>
export type CriarVinculoInput = z.output<typeof criarVinculoSchema>

export function validarFiltros(params: URLSearchParams) {
  if ([...params.keys()].some((key) => params.getAll(key).length > 1))
    return null
  const resultado = filtrosEstoqueSchema.safeParse(Object.fromEntries(params))
  return resultado.success ? resultado.data : null
}
