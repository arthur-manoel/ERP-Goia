import { Prisma } from "@/generated/prisma/client"

export type GrupoResultado = {
  tipo: "Receita" | "Custo" | "Despesa"
  categoria: string
  valor: string
}

export function calcularResultado(grupos: GrupoResultado[]) {
  const soma = (tipo: GrupoResultado["tipo"]) =>
    grupos
      .filter((g) => g.tipo === tipo)
      .reduce((total, g) => total.plus(g.valor), new Prisma.Decimal(0))
  const receita = soma("Receita"),
    custo = soma("Custo"),
    despesa = soma("Despesa")
  const margem = receita.minus(custo).minus(despesa)
  return {
    receita: receita.toFixed(2),
    custo: custo.toFixed(2),
    despesa: despesa.toFixed(2),
    margem: margem.toFixed(2),
    percentual: receita.gt(0)
      ? margem.div(receita).times(100).toFixed(1)
      : null,
    grupos,
  }
}

export type ResultadoDados = ReturnType<typeof calcularResultado>
