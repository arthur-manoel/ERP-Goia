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
