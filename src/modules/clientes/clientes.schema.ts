import { z } from "zod"
import { documentoValido, normalizarDocumento } from "./clientes.documento"

export const idSchema = z.number().int().positive().max(2147483647)
export const documentoSchema = z
  .string()
  .trim()
  .max(20)
  .refine(documentoValido, "CPF/CNPJ inválido.")
  .transform(normalizarDocumento)
export const statusSchema = z.enum(["ATIVO", "INATIVO"])
const textoOpcional = (max: number) =>
  z.string().trim().max(max).nullable().optional()
const campos = {
  nomeRazaoSocial: z
    .string()
    .trim()
    .min(1, "Informe o nome ou razão social.")
    .max(150),
  cpfCnpj: documentoSchema.nullable().optional(),
  email: z.string().trim().max(150).pipe(z.email()).nullable().optional(),
  telefone: textoOpcional(30),
  endereco: textoOpcional(255),
  numero: textoOpcional(20),
  complemento: textoOpcional(100),
  bairro: textoOpcional(100),
  cidade: textoOpcional(100),
  estado: z
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
    .nullable()
    .optional(),
  cep: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{3}$/, "CEP inválido.")
    .transform((value) => value.replace("-", ""))
    .nullable()
    .optional(),
  status: statusSchema.optional(),
}
export const criarSchema = z.strictObject(campos)
export const editarSchema = criarSchema
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    "Informe os dados para alteração.",
  )
const inteiroQuery = (max: number, padrao: string) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, "Informe uma paginação válida.")
    .default(padrao)
    .transform(Number)
    .pipe(z.number().int().positive().max(max))
const paginacao = {
  pagina: inteiroQuery(2147483647, "1"),
  limite: inteiroQuery(100, "20"),
}
export const listarSchema = z.strictObject({
  ...paginacao,
  nome: z.string().trim().min(1).max(150).optional(),
  cpfCnpj: documentoSchema.optional(),
  status: statusSchema.optional(),
})
export const pedidosSchema = z.strictObject(paginacao)
export type CriarInput = z.infer<typeof criarSchema>
export type EditarInput = z.infer<typeof editarSchema>
export type ListarInput = z.infer<typeof listarSchema>
export type PaginacaoInput = z.infer<typeof pedidosSchema>
