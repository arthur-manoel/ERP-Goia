import { z } from "zod"

/**
 * Fluxo de Produção = sequência de setores existentes pela qual uma peça
 * passa durante a produção. A posição de cada item em `steps` é a ordem da
 * etapa (índice 0 = primeira etapa).
 */
export const etapaFluxoSchema = z.object({
  sectorId: z.string().min(1, "Selecione um setor."),
})

export const fluxoProducaoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(100, "Use até 100 caracteres."),
  description: z
    .string()
    .trim()
    .max(255, "Use até 255 caracteres.")
    .optional()
    .transform((value) => value ?? ""),
  status: z.enum(["Ativo", "Inativo"]),
  steps: z
    .array(etapaFluxoSchema)
    .min(1, "Adicione ao menos um setor ao fluxo.")
    .max(100, "Use até 100 setores no fluxo.")
    .refine(
      (steps) =>
        new Set(steps.map((step) => step.sectorId)).size === steps.length,
      "Um mesmo setor não pode aparecer duas vezes no fluxo.",
    ),
})

export type FluxoProducao = z.infer<typeof fluxoProducaoSchema> & { id: string }
