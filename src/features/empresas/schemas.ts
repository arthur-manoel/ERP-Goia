import { z } from "zod"
import { estados } from "@/features/fornecedores/regras"

// Contrato de referência: PR #155. Unificar com o schema aprovado na integração.
export function cnpjEmpresaValido(valor: string) {
  if (!/^\d{14}$/.test(valor) || /^(\d)\1{13}$/.test(valor)) return false
  const digito = (parte: string, pesos: number[]) => {
    const resto =
      pesos.reduce(
        (soma, peso, indice) => soma + Number(parte[indice]) * peso,
        0,
      ) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return (
    digito(valor.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(valor[12]) &&
    digito(valor.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(valor[13])
  )
}
const texto = (limite: number) =>
  z
    .string()
    .trim()
    .min(1, "Preencha este campo.")
    .max(limite, `Use até ${limite} caracteres.`)
const cnpj = z
  .string()
  .trim()
  .regex(
    /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/,
    "Informe um CNPJ numérico de 14 dígitos.",
  )
  .transform((valor) => valor.replace(/\D/g, ""))
  .refine(cnpjEmpresaValido, "CNPJ inválido.")
const campos = {
  razao_social: texto(150),
  cnpj,
  nome_fantasia: texto(150).nullable(),
  inscricao_estadual: texto(30).nullable(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("E-mail inválido.").max(150))
    .nullable(),
  telefone: z
    .string()
    .trim()
    .regex(
      /^(?:\+\d{1,3} ?)?(?:\(\d{2}\) ?|\d{2} ?)\d{4,5}-?\d{4}$/,
      "Informe telefone com DDD.",
    )
    .transform((valor) => valor.replace(/[^+\d]/g, ""))
    .nullable(),
  endereco: texto(255).nullable(),
  numero: texto(20).nullable(),
  complemento: texto(100).nullable(),
  bairro: texto(100).nullable(),
  cidade: texto(100).nullable(),
  estado: z
    .string()
    .trim()
    .toUpperCase()
    .refine(
      (valor) => estados.some((uf) => uf.value === valor),
      "Selecione uma UF válida.",
    )
    .nullable(),
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido.")
    .transform((valor) => valor.replace("-", ""))
    .nullable(),
  logo_url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https$/ }))
    .refine((valor) => {
      const url = new URL(valor)
      return !url.username && !url.password
    }, "Use uma URL HTTPS sem credenciais.")
    .nullable(),
  cor_tema: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use uma cor no formato #RRGGBB.")
    .toLowerCase(),
}
export const cadastroEmpresaSchema = z.strictObject(campos)
export const edicaoEmpresaSchema = cadastroEmpresaSchema.partial()
export type DadosEmpresa = z.output<typeof cadastroEmpresaSchema>
export type EdicaoEmpresa = z.output<typeof edicaoEmpresaSchema>
export type FormularioEmpresa = Record<keyof DadosEmpresa, string>

export const resumoEmpresaSchema = z.object({
  id: z.number().int().positive(),
  razao_social: z.string(),
  nome_fantasia: z.string().nullable(),
  cnpj: z.string(),
  cidade: z.string().nullable(),
  estado: z.string().nullable(),
  status: z.enum(["ATIVA", "INATIVA"]),
})
export const empresaSchema = resumoEmpresaSchema.extend({
  inscricao_estadual: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
  endereco: z.string().nullable(),
  numero: z.string().nullable(),
  complemento: z.string().nullable(),
  bairro: z.string().nullable(),
  cep: z.string().nullable(),
  logo_url: z.string().nullable(),
  cor_tema: z.string(),
})
export type Empresa = z.infer<typeof empresaSchema>
export type ResumoEmpresa = z.infer<typeof resumoEmpresaSchema>

export function formularioEmpresa(empresa?: Empresa): FormularioEmpresa {
  return Object.fromEntries(
    Object.keys(campos).map((campo) => [
      campo,
      empresa?.[campo as keyof DadosEmpresa] ??
        (campo === "cor_tema" ? "#22c55e" : ""),
    ]),
  ) as FormularioEmpresa
}
function converter(valores: FormularioEmpresa) {
  return Object.fromEntries(
    Object.entries(valores).map(([chave, valor]) => [
      chave,
      ["razao_social", "cnpj", "cor_tema"].includes(chave)
        ? valor.trim()
        : valor.trim() || null,
    ]),
  )
}
export function payloadEmpresa(valores: FormularioEmpresa, original?: Empresa) {
  const atual = converter(valores)
  if (!original) return atual
  const anteriores = converter(formularioEmpresa(original))
  return Object.fromEntries(
    Object.entries(atual).filter(
      ([campo, valor]) => valor !== anteriores[campo],
    ),
  )
}
