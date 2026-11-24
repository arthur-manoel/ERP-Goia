import { z } from "zod"
import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"
import type { RequisitarProdutos } from "./api"
import { produtoFornecedorSchema } from "./fornecedores-schema"

export const opcaoFornecedorProdutoSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string(),
})
export type OpcaoFornecedorProduto = z.infer<
  typeof opcaoFornecedorProdutoSchema
>

export async function listarFornecedoresProduto<T>(
  requisitar: RequisitarProdutos,
  rota: string,
  idEmpresa: number,
  schema: z.ZodType<T>,
  signal: AbortSignal,
): Promise<T[]> {
  const registros: T[] = []
  let paginas = 1
  for (let page = 1; page <= paginas; page++) {
    const resposta = await requisitar(`${rota}?page=${page}&limit=100`, {
      signal,
      headers: { "X-Empresa-Id": String(idEmpresa) },
    })
    if (!resposta.ok)
      throw new Error(
        resposta.status === 404
          ? "A consulta de fornecedores do produto está indisponível. Tente novamente mais tarde."
          : await mensagemErro(resposta),
      )
    const corpo = z
      .object({
        success: z.literal(true),
        data: z.object({
          rows: z.array(schema),
          totalPages: z.number().int().min(0).max(10_000),
        }),
      })
      .safeParse(await resposta.json())
    if (!corpo.success) throw new Error("Resposta de fornecedores inválida.")
    registros.push(...corpo.data.data.rows)
    paginas = corpo.data.data.totalPages
  }
  return registros
}

export function schemaFornecedoresDaEmpresa(
  idEmpresa: number,
  idProduto: number,
) {
  return produtoFornecedorSchema.refine(
    (item) => item.id_empresa === idEmpresa && item.id_produto === idProduto,
    "Fornecedor retornado fora do contexto do produto.",
  )
}
