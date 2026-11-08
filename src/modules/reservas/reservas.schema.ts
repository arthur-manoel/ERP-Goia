import { z } from "zod"
export const id = z.number().int().min(1).max(2147483647)
export const quantidade = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/)
  .refine(
    (v) => /[1-9]/.test(v),
    "Informe uma quantidade positiva com até três casas decimais.",
  )
export const reservaSchema = z.strictObject({
  origem: z.enum(["PEDIDO", "PRODUCAO"]),
  idOrigem: id,
  idItem: id.optional(),
  idProduto: id,
  idVariacao: id.optional(),
  idLocalEstoque: id,
  quantidade,
})
export const liberarSchema = z.strictObject({
  quantidade,
  motivo: z.string().trim().min(1).max(255),
})
export const consumoSchema = z
  .strictObject({
    idReserva: id,
    quantidade: z.union([
      quantidade,
      z.literal("0"),
      z.literal("0.0"),
      z.literal("0.00"),
      z.literal("0.000"),
    ]),
    concluirConsumo: z.boolean().default(false),
    motivoDivergencia: z.string().trim().min(1).max(255).optional(),
  })
  .refine(
    (v) =>
      !/^0(?:\.0{1,3})?$/.test(v.quantidade) ||
      (v.concluirConsumo && Boolean(v.motivoDivergencia)),
    {
      message:
        "Quantidade zero exige encerramento explícito e motivo; nenhuma saída será criada.",
    },
  )
export const entregaSchema = z.strictObject({
  nomeRecebedor: z.string().trim().min(1).max(150),
  itens: z
    .array(z.strictObject({ idItem: id, idReserva: id, quantidade }))
    .min(1)
    .max(200),
})
export const transferenciaSchema = z.strictObject({
  idProduto: id,
  idVariacao: id.optional(),
  idLocalOrigem: id,
  idSetorOrigem: id,
  idLocalDestino: id,
  idSetorDestino: id,
  quantidade,
  observacao: z.string().trim().min(1).max(255),
})
export const listarSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
  origem: z.enum(["PEDIDO", "PRODUCAO"]).optional(),
  status: z.enum(["ATIVA", "ATENDIDA", "CANCELADA"]).optional(),
  busca: z.string().trim().max(100).optional(),
})
export type ReservaInput = z.infer<typeof reservaSchema>
