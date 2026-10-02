import { z } from "zod"

export type CorDisponivel = {
  id: string
  nome: string
  hexadecimal: string
}

export type TamanhoDisponivel = {
  id: string
  nome: string
}

export type VariacaoProduto = {
  corId: string
  tamanhoId: string
  saldo: number
}

export type SituacaoProduto = "Disponível" | "Estoque baixo" | "Sem estoque"

export type ProdutoPronto = {
  id: string
  nome: string
  sku: string
  categoria: string
  unidade: string
  precoCusto: number
  margemLucro: number
  precoVenda: number
  variacoes: VariacaoProduto[]
}

const valorPositivo = z
  .number()
  .finite()
  .positive("Informe um valor maior que zero.")

export const variacaoGradeSchema = z.object({
  corId: z.string().min(1),
  tamanhoId: z.string().min(1),
  saldo: z.number().finite().min(0, "O saldo não pode ser negativo."),
})

export const produtoProntoSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome do produto.").max(150),
    sku: z.string().trim().min(1, "Informe o código/SKU.").max(60),
    categoria: z.string().min(1, "Selecione uma categoria."),
    unidade: z.string().min(1, "Selecione uma unidade de medida."),
    precoCusto: valorPositivo,
    margemLucro: z
      .number()
      .finite()
      .min(0, "A margem não pode ser negativa.")
      .max(99.99, "A margem deve ser menor que 100%."),
    cores: z.array(z.string()).min(1, "Selecione ao menos uma cor."),
    tamanhos: z.array(z.string()).min(1, "Selecione ao menos um tamanho."),
    grade: z.array(variacaoGradeSchema).min(1, "Gere ao menos uma variação."),
  })
  .superRefine((dados, contexto) => {
    const esperadas = dados.cores.length * dados.tamanhos.length
    const chaves = new Set(
      dados.grade.map((variacao) => `${variacao.corId}:${variacao.tamanhoId}`),
    )

    if (chaves.size !== esperadas) {
      contexto.addIssue({
        code: "custom",
        path: ["grade"],
        message: "Preencha o saldo inicial para cada combinação da grade.",
      })
    }
  })

export type ProdutoProntoFormulario = z.infer<typeof produtoProntoSchema>

export const opcoesCategoria = [
  { value: "Camisetas", label: "Camisetas" },
  { value: "Calças", label: "Calças" },
  { value: "Uniformes", label: "Uniformes" },
  { value: "Acessórios", label: "Acessórios" },
]

export const opcoesUnidade = [
  { value: "pc", label: "Peça - pc" },
  { value: "kit", label: "Kit - kit" },
  { value: "un", label: "Unidade - un" },
]

export const coresDisponiveis: CorDisponivel[] = [
  { id: "azul", nome: "Azul", hexadecimal: "#2563EB" },
  { id: "branco", nome: "Branco", hexadecimal: "#F8FAFC" },
  { id: "preto", nome: "Preto", hexadecimal: "#18181B" },
  { id: "verde", nome: "Verde", hexadecimal: "#16A34A" },
]

export const tamanhosDisponiveis: TamanhoDisponivel[] = [
  { id: "pp", nome: "PP" },
  { id: "p", nome: "P" },
  { id: "m", nome: "M" },
  { id: "g", nome: "G" },
  { id: "gg", nome: "GG" },
]

export function calcularPrecoVenda(custo: number, margem: number) {
  const divisor = 1 - margem / 100
  return divisor > 0 ? custo / divisor : 0
}

export function totalSaldo(produto: ProdutoPronto) {
  return produto.variacoes.reduce(
    (total, variacao) => total + variacao.saldo,
    0,
  )
}

export function situacaoProduto(produto: ProdutoPronto): SituacaoProduto {
  const saldo = totalSaldo(produto)
  if (saldo === 0) return "Sem estoque"
  if (produto.variacoes.some((variacao) => variacao.saldo <= 3)) {
    return "Estoque baixo"
  }
  return "Disponível"
}

export function chaveVariacao(corId: string, tamanhoId: string) {
  return `${corId}:${tamanhoId}`
}
