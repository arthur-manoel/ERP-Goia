import { z } from "zod"
import { movimentacao_estoque_tipo } from "@/generated/prisma/enums"
import { ValidationError } from "@/lib/api/errors"

export const direcoes = {
  ENTRADA_NF: "ENTRADA",
  SAIDA_VENDA: "SAIDA",
  ENTRADA_PRODUCAO: "ENTRADA",
  SAIDA_PRODUCAO: "SAIDA",
  AJUSTE_ENTRADA: "ENTRADA",
  AJUSTE_SAIDA: "SAIDA",
  TRANSFERENCIA_ENTRADA: "ENTRADA",
  TRANSFERENCIA_SAIDA: "SAIDA",
} as const satisfies Record<movimentacao_estoque_tipo, "ENTRADA" | "SAIDA">

const inteiro = (maximo = 2147483647) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.int().min(1).max(maximo))
const data = z.iso.date().refine((v) => v >= "1970-01-01" && v < "9999-01-01")
const diaMs = 86400000
const fuso = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" })
const utc = (dia: string) => Date.parse(dia + "T00:00:00Z")
const somarDias = (dia: string, quantidade: number) =>
  new Date(utc(dia) + quantidade * diaMs).toISOString().slice(0, 10)

const esquema = z
  .strictObject({
    dataInicio: data.optional(),
    dataFim: data.optional(),
    idProduto: inteiro().optional(),
    idLocalEstoque: inteiro().optional(),
    idSetor: inteiro().optional(),
    idVariacao: inteiro().optional(),
    idMovimentacao: inteiro().optional(),
    direcao: z.enum(["ENTRADA", "SAIDA"]).optional(),
    tipo: z.enum(movimentacao_estoque_tipo).optional(),
    origemTipo: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{0,49}$/)
      .optional(),
    origemId: inteiro().optional(),
    pagina: inteiro(10000).default(1),
    limite: inteiro(100).default(25),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.dataInicio) !== Boolean(v.dataFim))
      ctx.addIssue({
        code: "custom",
        path: ["dataInicio"],
        message: "Informe as duas datas do período.",
      })
    if (
      v.dataInicio &&
      v.dataFim &&
      (v.dataFim < v.dataInicio ||
        utc(v.dataFim) - utc(v.dataInicio) >= 366 * diaMs)
    )
      ctx.addIssue({
        code: "custom",
        path: ["dataFim"],
        message: "Período deve ter até 366 dias, em ordem cronológica.",
      })
    if (v.origemId && !v.origemTipo)
      ctx.addIssue({
        code: "custom",
        path: ["origemTipo"],
        message: "Informe o tipo para consultar um ID de origem.",
      })
    if (v.tipo && v.direcao && direcoes[v.tipo] !== v.direcao)
      ctx.addIssue({
        code: "custom",
        path: ["tipo"],
        message: "Tipo e direção incompatíveis.",
      })
    if ((v.pagina - 1) * v.limite > 100000)
      ctx.addIssue({
        code: "custom",
        path: ["pagina"],
        message: "Refine o período ou os filtros para continuar.",
      })
  })

// Procura o primeiro instante do dia civil, inclusive em datas em que o horário
// de verão suprimiu a meia-noite em São Paulo.
function inicioCivil(dia: string) {
  let inicio = utc(dia) - diaMs
  let fim = utc(dia) + diaMs
  while (inicio < fim) {
    const meio = Math.floor((inicio + fim) / 2)
    if (fuso.format(meio) < dia) inicio = meio + 1
    else fim = meio
  }
  return new Date(inicio)
}

export function validarConsulta(input: unknown, agora = new Date()) {
  const resultado = esquema.safeParse(input)
  if (!resultado.success)
    throw new ValidationError(
      resultado.error.issues
        .map((i) => `${i.path.join(".") || "consulta"}: ${i.message}`)
        .join("; "),
    )
  const { dataInicio, dataFim, ...filtros } = resultado.data
  const ate = dataFim ?? fuso.format(agora)
  const de = dataInicio ?? somarDias(ate, -29)
  return {
    ...filtros,
    periodo: { dataInicio: de, dataFim: ate },
    inicio: inicioCivil(de),
    fim: inicioCivil(somarDias(ate, 1)),
  }
}
export type Consulta = ReturnType<typeof validarConsulta>
