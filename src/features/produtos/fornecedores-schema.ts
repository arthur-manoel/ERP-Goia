import { z } from "zod"

const id = z.number().int().positive()

function decimal(casas: number) {
  return z
    .string()
    .trim()
    .transform((valor) => valor.replace(",", "."))
    .refine(
      (valor) =>
        !valor ||
        new RegExp(`^\\d{1,${15 - casas}}(?:\\.\\d{1,${casas}})?$`).test(valor),
      `Informe um valor positivo ou zero, com até ${casas} casas decimais, sem separador de milhar.`,
    )
    .transform((valor) => {
      if (!valor) return null
      const [inteiros, fracao = ""] = valor.split(".")
      return `${inteiros.replace(/^0+(?=\d)/, "")}.${fracao.padEnd(casas, "0")}`
    })
}

export const condicoesProdutoFornecedorSchema = z.object({
  codigo_produto_fornecedor: z
    .string()
    .trim()
    .max(100, "Use até 100 caracteres.")
    .transform((valor) => valor || null),
  preco_ultima_compra: decimal(2),
  prazo_entrega_dias: z
    .string()
    .trim()
    .refine(
      (valor) =>
        !valor || (/^\d+$/.test(valor) && Number(valor) <= 2_147_483_647),
      "Informe dias inteiros entre 0 e 2147483647.",
    )
    .transform((valor) => (valor ? Number(valor) : null)),
  quantidade_minima: decimal(3),
  fornecedor_principal: z.boolean(),
})

export const produtoFornecedorSchema = z.object({
  id,
  id_empresa: id,
  id_produto: id,
  id_fornecedor: id,
  codigo_produto_fornecedor: z.string().max(100).nullable(),
  preco_ultima_compra: z
    .string()
    .regex(/^\d{1,13}(?:\.\d{1,2})?$/)
    .nullable(),
  prazo_entrega_dias: z.number().int().min(0).max(2_147_483_647).nullable(),
  quantidade_minima: z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,3})?$/)
    .nullable(),
  fornecedor_principal: z.boolean(),
  status: z.enum(["ATIVO", "INATIVO"]),
  fornecedores: z.object({
    razao_social: z.string(),
    nome_fantasia: z.string().nullable(),
  }),
})

export type ProdutoFornecedor = z.infer<typeof produtoFornecedorSchema>
export type CondicoesProdutoFornecedor = z.output<
  typeof condicoesProdutoFornecedorSchema
>
export type FormularioProdutoFornecedor = z.input<
  typeof condicoesProdutoFornecedorSchema
>

export function formularioFornecedor(
  item?: ProdutoFornecedor,
): FormularioProdutoFornecedor {
  return {
    codigo_produto_fornecedor: item?.codigo_produto_fornecedor ?? "",
    preco_ultima_compra: item?.preco_ultima_compra?.replace(".", ",") ?? "",
    prazo_entrega_dias: item?.prazo_entrega_dias?.toString() ?? "",
    quantidade_minima: item?.quantidade_minima?.replace(".", ",") ?? "",
    fornecedor_principal: item?.fornecedor_principal ?? false,
  }
}

export function alteracoesFornecedor(
  item: ProdutoFornecedor,
  dados: CondicoesProdutoFornecedor,
) {
  const anteriores = condicoesProdutoFornecedorSchema.parse(
    formularioFornecedor(item),
  )
  return Object.fromEntries(
    Object.entries(dados).filter(
      ([chave, valor]) =>
        valor !== anteriores[chave as keyof CondicoesProdutoFornecedor],
    ),
  )
}
