import { z } from "zod"
import {
  idRecebimento,
  dataRecebimento,
  recebimentoSchema,
} from "@/modules/recebimentos/recebimentos.schema"

export const tiposLancamento = ["ENTRADA", "SAIDA"] as const
export const origensLancamento = [
  "RECEBIMENTO",
  "PAGAMENTO",
  "DESPESA",
  "AJUSTE",
  "TRANSFERENCIA",
  "REEMBOLSO",
] as const
export const dataCivil = (data: Date) =>
  data.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
export function inicioDiaFinanceiro(dia: string) {
  const utc = Date.parse(dia + "T00:00:00Z")
  let inicio = utc - 86_400_000,
    fim = utc + 86_400_000
  while (inicio < fim) {
    const meio = Math.floor((inicio + fim) / 2)
    if (dataCivil(new Date(meio)) < dia) inicio = meio + 1
    else fim = meio
  }
  return new Date(inicio)
}
export const saldoAte = (dia: string) =>
  inicioDiaFinanceiro(
    new Date(Date.parse(dia + "T00:00:00Z") + 86_400_000)
      .toISOString()
      .slice(0, 10),
  )
const dia = dataRecebimento.refine(
  (v) => v >= "1970-01-01" && v < "9999-01-01",
  "Informe uma data a partir de 1970.",
)
const idQuery = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, "Informe um identificador numérico válido.")
  .transform(Number)
  .pipe(idRecebimento)
const busca = z.string().trim().min(1).max(100).optional()
export const opcoesSchema = z.strictObject({ conta: busca, categoria: busca })
export const consultaSchema = z
  .strictObject({
    de: dia,
    ate: dia,
    pagina: idQuery.pipe(z.number().max(4001)).default(1),
    idConta: idQuery.optional(),
    idCategoria: idQuery.optional(),
    tipo: z.enum(tiposLancamento).optional(),
    origem: z.enum(origensLancamento).optional(),
    busca,
  })
  .refine(
    (v) =>
      v.ate >= v.de && Date.parse(v.ate) - Date.parse(v.de) < 366 * 86_400_000,
    "Informe um período de até 366 dias, em ordem cronológica.",
  )
export const idMovimentoSchema = idQuery
export const lancamentoManualSchema = z.strictObject({
  idConta: idRecebimento,
  idCategoria: idRecebimento,
  tipo: z.enum(tiposLancamento),
  valor: recebimentoSchema.shape.valor,
  data: dia,
  descricao: z.string().trim().min(1, "Informe a descrição.").max(255),
  observacao: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .transform((v) => v || null),
})
export type LancamentoManual = z.output<typeof lancamentoManualSchema>
export type ConsultaLancamentos = z.output<typeof consultaSchema>
