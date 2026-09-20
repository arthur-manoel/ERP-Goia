import { z } from "zod"
import { dataIso, dinheiro, texto } from "@/features/erp/validacao"

export const lancamentoSchema = z
  .object({
    description: texto("Descrição", 3),
    type: z.enum(["Pagar", "Receber"]),
    partyId: z
      .string()
      .min(1, "Selecione um cliente ou fornecedor cadastrado."),
    amount: dinheiro.refine(
      (value) => value > 0,
      "O valor deve ser maior que zero.",
    ),
    dueDate: dataIso,
    status: z.enum(["Em aberto", "Liquidado"]),
    paidDate: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.status === "Liquidado") {
      if (!dataIso.safeParse(data.paidDate).success)
        ctx.addIssue({
          code: "custom",
          path: ["paidDate"],
          message: "Informe a data de pagamento ou recebimento.",
        })
      else if (
        data.paidDate >
        new Date().toLocaleDateString("sv-SE", {
          timeZone: "America/Sao_Paulo",
        })
      )
        ctx.addIssue({
          code: "custom",
          path: ["paidDate"],
          message: "A liquidação não pode estar no futuro.",
        })
    } else if (data.paidDate)
      ctx.addIssue({
        code: "custom",
        path: ["paidDate"],
        message:
          "Remova a data de liquidação ou altere a situação para Liquidado.",
      })
  })

export type Lancamento = z.infer<typeof lancamentoSchema> & { id: string }
