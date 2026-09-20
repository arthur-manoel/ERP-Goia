import { z } from "zod"
import { dinheiro, numeroNaoNegativo, texto } from "@/features/erp/validacao"

export const unidades = [
  { value: "un.", label: "Unidade (un.)" },
  { value: "pc", label: "Peça (pc)" },
  { value: "par", label: "Par (par)" },
  { value: "dz", label: "Dúzia (dz)" },
  { value: "cx", label: "Caixa (cx)" },
  { value: "pct", label: "Pacote (pct)" },
  { value: "rolo", label: "Rolo (rolo)" },
  { value: "m", label: "Metro (m)" },
  { value: "cm", label: "Centímetro (cm)" },
  { value: "mm", label: "Milímetro (mm)" },
  { value: "m²", label: "Metro quadrado (m²)" },
  { value: "kg", label: "Quilograma (kg)" },
  { value: "g", label: "Grama (g)" },
  { value: "L", label: "Litro (L)" },
  { value: "mL", label: "Mililitro (mL)" },
] as const

export const unidadeInteira = (unidade: string) =>
  ["un.", "pc", "par", "dz", "cx", "pct", "rolo"].includes(unidade)

const quantidadeInsumo = numeroNaoNegativo.refine(
  (value) => Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001,
  "Use no máximo três casas decimais.",
)

export const insumoSchema = z
  .object({
    name: texto("Nome", 3),
    code: texto("Código"),
    category: z.enum(["Tecido", "Aviamento"]),
    unit: z.enum(unidades.map((item) => item.value)),
    cost: dinheiro,
    quantity: quantidadeInsumo,
    minimum: quantidadeInsumo,
    description: z.string().trim().max(500, "Use até 500 caracteres."),
  })
  .superRefine((data, ctx) => {
    if (!unidadeInteira(data.unit)) return
    for (const key of ["quantity", "minimum"] as const)
      if (!Number.isInteger(data[key]))
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Use uma quantidade inteira para esta unidade.",
        })
  })

export type Insumo = z.infer<typeof insumoSchema>

export function calcularVenda(custo: number, margem: number) {
  if (
    !Number.isFinite(custo) ||
    !Number.isFinite(margem) ||
    custo < 0 ||
    margem < 0 ||
    margem >= 100
  )
    return NaN
  return Math.round((custo / (1 - margem / 100) + Number.EPSILON) * 100) / 100
}

export const materialSchema = z
  .object({
    code: texto("Código"),
    name: texto("Nome", 3),
    description: z.string().trim().max(500, "Use até 500 caracteres."),
    category: z.enum(["Tecido", "Aviamento", "Produto pronto"]),
    unit: z.enum(unidades.map((item) => item.value)),
    quantity: numeroNaoNegativo,
    minimum: numeroNaoNegativo,
    cost: dinheiro,
    margin: dinheiro.refine(
      (value) => value < 100,
      "A margem deve ser menor que 100%.",
    ),
    salePrice: dinheiro,
    kind: z.enum(["Comprado", "Fabricado", "Kit"]),
    // Grade temporária do front-end, até a integração com produto_variacoes.
    variations: z
      .array(
        z.object({
          id: z.string().min(1),
          size: texto("Tamanho", 1),
          color: texto("Cor", 1),
          quantity: numeroNaoNegativo.int("Use uma quantidade inteira."),
        }),
      )
      .max(100, "Use até 100 variações.")
      .optional(),
    components: z
      .array(
        z.object({
          materialId: z.string().min(1, "Selecione um componente."),
          quantity: numeroNaoNegativo.positive(
            "Informe uma quantidade maior que zero.",
          ),
        }),
      )
      .max(100, "Use até 100 componentes."),
  })
  .superRefine((data, ctx) => {
    const variacoes = data.variations ?? []
    const chaves = new Set<string>()
    variacoes.forEach((variacao, index) => {
      const chave = JSON.stringify([
        variacao.size.toLocaleLowerCase("pt-BR"),
        variacao.color.toLocaleLowerCase("pt-BR"),
      ])
      if (chaves.has(chave))
        ctx.addIssue({
          code: "custom",
          path: ["variations", index, "color"],
          message: "Esta combinação de tamanho e cor já existe.",
        })
      chaves.add(chave)
    })
    if (
      variacoes.length &&
      (data.category !== "Produto pronto" || !["un.", "pc"].includes(data.unit))
    )
      ctx.addIssue({
        code: "custom",
        path: ["variations"],
        message:
          "Use variações somente em produtos prontos medidos em unidades ou peças.",
      })
    if (
      variacoes.length &&
      variacoes.reduce((total, item) => total + item.quantity, 0) !==
        data.quantity
    )
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message:
          "O saldo atual deve ser igual à soma dos saldos das variações.",
      })
    if (unidadeInteira(data.unit))
      for (const key of ["quantity", "minimum"] as const)
        if (!Number.isInteger(data[key]))
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Use uma quantidade inteira para esta unidade.",
          })
    if (
      Number.isFinite(calcularVenda(data.cost, data.margin)) &&
      Math.abs(data.salePrice - calcularVenda(data.cost, data.margin)) > 0.001
    )
      ctx.addIssue({
        code: "custom",
        path: ["salePrice"],
        message:
          "O preço de venda deve corresponder ao custo e à margem informados.",
      })
    if (data.category !== "Produto pronto" && data.kind !== "Comprado")
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Composição disponível somente para produtos prontos.",
      })
    const composto =
      data.category === "Produto pronto" && data.kind !== "Comprado"
    if (composto && !data.components.length)
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: "Adicione pelo menos uma matéria-prima ou componente.",
      })
    if (!composto && data.components.length)
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: "Somente produtos fabricados ou kits podem ter componentes.",
      })
    const encontrados = new Set<string>()
    data.components.forEach((item, index) => {
      if (encontrados.has(item.materialId))
        ctx.addIssue({
          code: "custom",
          path: ["components", index, "materialId"],
          message:
            "Componente repetido. Ajuste a quantidade da linha existente.",
        })
      encontrados.add(item.materialId)
    })
  })

export type Material = z.infer<typeof materialSchema> & { id: string }
