import { z } from "zod"

const inteiro = (maximo = 2147483647) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(maximo))

const data = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((valor) => {
    const dataInformada = new Date(`${valor}T12:00:00Z`)

    return (
      !Number.isNaN(dataInformada.getTime()) &&
      dataInformada.toISOString().slice(0, 10) === valor
    )
  })

export const filtrosRelatorioProducaoSchema = z
  .strictObject({
    data_inicial: data,
    data_final: data,
    pagina: inteiro().default(1),
    limite: inteiro(100).default(20),
  })
  .refine((filtros) => filtros.data_inicial <= filtros.data_final, {
    path: ["data_final"],
  })

export type FiltrosRelatorioProducao = z.output<
  typeof filtrosRelatorioProducaoSchema
>

export function validarFiltrosRelatorioProducao(params: URLSearchParams) {
  if ([...params.keys()].some((key) => params.getAll(key).length > 1))
    return null

  const resultado = filtrosRelatorioProducaoSchema.safeParse(
    Object.fromEntries(params),
  )
  return resultado.success ? resultado.data : null
}
