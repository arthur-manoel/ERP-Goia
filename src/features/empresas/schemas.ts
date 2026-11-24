import { z } from "zod"
import {
  createEmpresaSchema,
  patchEmpresaSchema,
} from "../../../modules/empresas/schema"
export { cnpjValido as cnpjEmpresaValido } from "../../../modules/empresas/schema"

// Regras da API aprovada; texto amigável para o obrigatório no formulário.
export const cadastroEmpresaSchema = createEmpresaSchema.extend({
  razao_social: z
    .string()
    .trim()
    .min(1, "Preencha este campo.")
    .max(150, "Use até 150 caracteres."),
})
const { status, ...camposEditaveis } = patchEmpresaSchema.shape
export const situacaoEmpresaSchema = status
// Permite edição sem mudanças para fechar o diálogo sem realizar uma escrita.
export const edicaoEmpresaSchema = z.strictObject({
  ...camposEditaveis,
  razao_social: cadastroEmpresaSchema.shape.razao_social.optional(),
})
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
    Object.keys(cadastroEmpresaSchema.shape).map((campo) => [
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
