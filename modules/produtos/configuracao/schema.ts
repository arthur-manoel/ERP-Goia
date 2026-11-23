import { z } from "zod"

const maxInt = 2_147_483_647
export const id = z.number().int().min(1).max(maxInt)
export const idRota = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(id)
export const paginaSchema = z.strictObject({
  page: idRota.pipe(z.number().max(10_000)).default(1),
  limit: idRota.pipe(z.number().max(100)).default(20),
})
export type Pagina = z.output<typeof paginaSchema>

const status = z.enum(["ATIVO", "INATIVO"])
const combinacao = z
  .strictObject({
    id_cor: id.nullable().default(null),
    id_tamanho: id.nullable().default(null),
  })
  .refine((valor) => valor.id_cor !== null || valor.id_tamanho !== null, {
    message: "Informe pelo menos uma cor ou um tamanho.",
  })

export const gerarGradeSchema = z.strictObject({
  variacoes: z.array(combinacao).min(1).max(200),
})
export type Combinacao = z.output<typeof combinacao>
export const situacaoVariacaoSchema = z.strictObject({ status })

const condicoes = {
  codigo_produto_fornecedor: z
    .string()
    .trim()
    .max(100)
    .transform((valor) => valor || null)
    .nullable()
    .optional(),
  preco_ultima_compra: z
    .string()
    .regex(/^\d{1,13}(?:\.\d{1,2})?$/)
    .nullable()
    .optional(),
  prazo_entrega_dias: z.number().int().min(0).max(maxInt).nullable().optional(),
  quantidade_minima: z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,3})?$/)
    .nullable()
    .optional(),
  fornecedor_principal: z.boolean().optional(),
}

export const criarFornecedorSchema = z.strictObject({
  id_fornecedor: id,
  ...condicoes,
})

export const editarFornecedorSchema = z
  .strictObject({ ...condicoes, status: status.optional() })
  .refine(
    (valor) => Object.keys(valor).length > 0,
    "Informe o que deseja alterar.",
  )
  .refine(
    (valor) =>
      valor.status !== "INATIVO" || valor.fornecedor_principal !== true,
    "Um vínculo inativo não pode ser principal.",
  )

export type CriarFornecedor = z.output<typeof criarFornecedorSchema>
export type EditarFornecedor = z.output<typeof editarFornecedorSchema>
