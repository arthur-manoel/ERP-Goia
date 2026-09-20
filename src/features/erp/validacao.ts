import { z } from "zod"

export const texto = (rotulo: string, minimo = 2) =>
  z
    .string()
    .trim()
    .min(minimo, `${rotulo}: informe pelo menos ${minimo} caracteres.`)
    .max(120, "Use até 120 caracteres.")

export const numeroNaoNegativo = z
  .number({ error: "Informe um número válido." })
  .finite()
  .min(0, "O valor não pode ser negativo.")

export const inteiroPositivo = z
  .number({ error: "Informe uma quantidade válida." })
  .finite()
  .int("Use uma quantidade inteira.")
  .positive("A quantidade deve ser maior que zero.")

export const dinheiro = numeroNaoNegativo.refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  "Use no máximo duas casas decimais.",
)

export const dataIso = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Informe uma data válida.",
  )
