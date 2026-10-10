import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
const razaoSocial = z
  .string()
  .trim()
  .min(1, "Razão social obrigatória.")
  .max(150)
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()
const status = z.enum(["ATIVO", "INATIVO"])

// Formato numérico ou alfanumérico: 12 caracteres + 2 dígitos, com máscara opcional.
export const cnpjSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/,
    "CNPJ deve ter 14 caracteres ou usar a máscara XX.XXX.XXX/XXXX-99.",
  )
  .transform((value) => value.replace(/[./-]/g, ""))

const fields = {
  id_empresa: positiveId,
  razao_social: razaoSocial,
  nome_fantasia: optionalText(150),
  cnpj: cnpjSchema.nullable().optional(),
  inscricao_estadual: optionalText(30),
  endereco: optionalText(255),
  numero: optionalText(20),
  complemento: optionalText(100),
  bairro: optionalText(100),
  cidade: optionalText(100),
  estado: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Estado deve ter duas letras.")
    .nullable()
    .optional(),
  cep: optionalText(10),
  telefone: optionalText(30),
  email: z
    .string()
    .trim()
    .max(150)
    .email("Email inválido.")
    .nullable()
    .optional(),
  status,
}
export const createFornecedorSchema = z
  .object({ ...fields, status: status.default("ATIVO") })
  .strict()
export const updateFornecedorSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id e data_cadastro não podem ser alterados.",
  )
// PUT substitui os campos editáveis: obrigatórios presentes, opcionais omitidos viram null.
export const replaceFornecedorSchema = z
  .object({
    ...fields,
    nome_fantasia: fields.nome_fantasia.default(null),
    cnpj: fields.cnpj.default(null),
    inscricao_estadual: fields.inscricao_estadual.default(null),
    endereco: fields.endereco.default(null),
    numero: fields.numero.default(null),
    complemento: fields.complemento.default(null),
    bairro: fields.bairro.default(null),
    cidade: fields.cidade.default(null),
    estado: fields.estado.default(null),
    cep: fields.cep.default(null),
    telefone: fields.telefone.default(null),
    email: fields.email.default(null),
  })
  .strict()
export type ReplaceFornecedorData = z.output<typeof replaceFornecedorSchema>
export const fornecedorIdSchema = z
  .string()
  .regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const listFornecedoresSchema = z
  .object({
    page: fornecedorIdSchema.default(1),
    limit: fornecedorIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: fornecedorIdSchema.optional(),
    status: status.optional(),
    razao_social: razaoSocial.optional(),
    nome_fantasia: z.string().trim().min(1).max(150).optional(),
  })
  .strict()
export type CreateFornecedorData = z.output<typeof createFornecedorSchema>
export type UpdateFornecedorData = z.output<typeof updateFornecedorSchema>
export type FornecedorFilters = Pick<
  z.output<typeof listFornecedoresSchema>,
  "id_empresa" | "status" | "razao_social" | "nome_fantasia"
>
export type Pagination = { page: number; limit: number }
