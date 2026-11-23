import { z } from "zod"

export const empresaIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(z.number().int().max(2_147_483_647))
export const empresaParamsSchema = z.strictObject({ id: empresaIdSchema })

export function cnpjValido(cnpj: string) {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const digito = (parte: string, pesos: number[]) => {
    const resto =
      pesos.reduce((soma, peso, i) => soma + Number(parte[i]) * peso, 0) % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return (
    digito(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(cnpj[12]) &&
    digito(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) ===
      Number(cnpj[13])
  )
}
const cnpjFormato = z
  .string()
  .trim()
  .regex(
    /^(?:\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/,
    "Use um CNPJ numérico de 14 dígitos.",
  )
  .transform((v) => v.replace(/\D/g, ""))
const cnpj = cnpjFormato.refine(cnpjValido, "CNPJ inválido.")
const status = z.enum(["ATIVA", "INATIVA"])
const estado = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z.enum([
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ]),
  )
const texto = (max: number) => z.string().trim().min(1).max(max)
const opcionais = {
  nome_fantasia: texto(150).nullable(),
  inscricao_estadual: texto(30).nullable(),
  email: z.string().trim().toLowerCase().pipe(z.email().max(150)).nullable(),
  telefone: z
    .string()
    .trim()
    .regex(
      /^(?:\+\d{1,3} ?)?(?:\(\d{2}\) ?|\d{2} ?)\d{4,5}-?\d{4}$/,
      "Telefone inválido.",
    )
    .transform((v) => v.replace(/[^+\d]/g, ""))
    .nullable(),
  endereco: texto(255).nullable(),
  numero: texto(20).nullable(),
  complemento: texto(100).nullable(),
  bairro: texto(100).nullable(),
  cidade: texto(100).nullable(),
  estado: estado.nullable(),
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido.")
    .transform((v) => v.replace("-", ""))
    .nullable(),
  logo_url: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https$/ }))
    .refine((v) => {
      const url = new URL(v)
      return !url.username && !url.password
    }, "A URL não pode conter credenciais.")
    .nullable(),
}
const completos = {
  nome_fantasia: opcionais.nome_fantasia.default(null),
  inscricao_estadual: opcionais.inscricao_estadual.default(null),
  email: opcionais.email.default(null),
  telefone: opcionais.telefone.default(null),
  endereco: opcionais.endereco.default(null),
  numero: opcionais.numero.default(null),
  complemento: opcionais.complemento.default(null),
  bairro: opcionais.bairro.default(null),
  cidade: opcionais.cidade.default(null),
  estado: opcionais.estado.default(null),
  cep: opcionais.cep.default(null),
  logo_url: opcionais.logo_url.default(null),
}
const cor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .toLowerCase()
const campos = { razao_social: texto(150), cnpj, cor_tema: cor, ...opcionais }
export const createEmpresaSchema = z.strictObject({
  ...campos,
  ...completos,
  cor_tema: cor.default("#22c55e"),
})
export const updateEmpresaSchema = z.strictObject({
  ...campos,
  ...completos,
  cnpj: cnpj.optional(),
  cor_tema: cor.default("#22c55e"),
  status: status.optional(),
})
export const patchEmpresaSchema = z
  .strictObject({ ...campos, status })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.")
export const empresaFiltersSchema = z.strictObject({
  page: empresaIdSchema.pipe(z.number().max(1_000_000)).default(1),
  limit: empresaIdSchema.pipe(z.number().max(100)).default(10),
  search: texto(150).optional(),
  razao_social: texto(150).optional(),
  nome_fantasia: texto(150).optional(),
  cnpj: cnpjFormato.optional(),
  cidade: texto(100).optional(),
  estado: estado.optional(),
  status: status.optional(),
  sortBy: z
    .enum([
      "id",
      "razao_social",
      "nome_fantasia",
      "cnpj",
      "cidade",
      "estado",
      "status",
      "data_cadastro",
      "created_at",
      "updated_at",
    ])
    .default("razao_social"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
})
export type EmpresaFilters = z.output<typeof empresaFiltersSchema>
