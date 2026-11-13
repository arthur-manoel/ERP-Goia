import { z } from "zod"

export const periodoSchema = z
  .object({
    de: z.iso.date(),
    ate: z.iso.date(),
    pagina: z.coerce.number().int().min(1).max(1_000_000).default(1),
  })
  .strict()
  .refine((p) => p.de <= p.ate, {
    message: "A data inicial deve ser anterior ou igual à final.",
  })

export type FluxoCaixaDados = {
  entradas: string
  saidas: string
  saldoPeriodo: string
  saldoDisponivel: string
  aReceber: string
  aPagar: string
  saldoProjetado: string
  atrasados: { quantidade: number; receber: string; pagar: string }
  movimentos: {
    id: number
    descricao: string
    tipo: string
    data: string
    valor: string
  }[]
  pagina: number
  totalPaginas: number
}
