import { z } from "zod"

export const periodoResultadoSchema = z
  .object({ de: z.iso.date(), ate: z.iso.date() })
  .strict()
  .refine((p) => p.de <= p.ate, {
    message: "A data inicial deve ser anterior ou igual à final.",
  })
