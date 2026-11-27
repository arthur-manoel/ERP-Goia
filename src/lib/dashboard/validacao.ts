import { z } from "zod"

const contagem = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const decimal = z.string().regex(/^-?\d+(\.\d+)?$/)
const comparativoContagem = z.object({
  rotulo: z.string().trim().min(1).max(40),
  valorAnterior: contagem,
})
const comparativoMonetario = comparativoContagem.extend({
  valorAnterior: decimal,
})
const ordens = z
  .object({
    total: contagem,
    atrasadas: contagem.optional(),
    porStatus: z
      .array(
        z.object({
          rotulo: z.string().trim().min(1).max(40),
          quantidade: contagem,
        }),
      )
      .optional(),
    comparativo: comparativoContagem.optional(),
  })
  .refine((d) => d.atrasadas === undefined || d.atrasadas <= d.total)
  .refine(
    (d) =>
      d.porStatus === undefined ||
      d.porStatus.reduce((s, p) => s + p.quantidade, 0) === d.total,
  )
const pedidos = z
  .object({
    total: contagem,
    atrasados: contagem,
    vencemHoje: contagem,
    proximos: z.object({
      quantidade: contagem,
      janelaDias: z.number().int().min(1).max(365),
    }),
    maiorAtrasoEmDias: contagem.optional(),
    valorPendente: decimal.optional(),
    comparativo: comparativoContagem.optional(),
  })
  .refine((d) => d.atrasados + d.vencemHoje + d.proximos.quantidade <= d.total)
  .refine((d) => !d.maiorAtrasoEmDias || d.atrasados > 0)
const saldo = z.object({
  valor: decimal,
  entradas: decimal.optional(),
  saidas: decimal.optional(),
  evolucaoDiaria: z.array(decimal).max(31).optional(),
  comparativo: comparativoMonetario.optional(),
})
const estoque = z.object({
  total: contagem,
  semEstoque: contagem.optional(),
  semMinimo: contagem.optional(),
  totalMonitorados: contagem.optional(),
  comparativo: comparativoContagem.optional(),
  maisCriticos: z
    .array(
      z.object({
        id: contagem,
        nome: z.string(),
        tipo: z.string(),
        local: z.string(),
        unidade: z.string(),
        saldo: decimal,
        minimo: decimal,
        deficit: decimal,
        estado: z.enum([
          "SEM_ESTOQUE",
          "ABAIXO_MINIMO",
          "NO_MINIMO",
          "REGULAR",
          "NAO_CONFIGURADO",
        ]),
      }),
    )
    .optional(),
})

/** Valida também os objetos internos usados pelos cards, antes de renderizar. */
export const schemasDadosIndicadores = { ordens, pedidos, saldo, estoque }
