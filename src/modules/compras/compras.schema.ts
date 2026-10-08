import { z } from "zod"
import {
  chaveAcessoValida,
  idsDuplicados,
  normalizarChave,
  quantidadeValida,
  valorValido,
} from "./compras.regras"

export const idSchema = z.number().int().positive().max(2147483647)
const texto = (max: number) => z.string().trim().max(max).nullable().optional()

// Números vêm como string ou number do JSON; sinal negativo, expoente e vírgula são rejeitados.
const numeroTexto = z.union([z.string(), z.number()]).transform(String)
export const quantidadeSchema = numeroTexto.refine(
  quantidadeValida,
  "A quantidade deve ser maior que zero, com até 3 casas decimais.",
)
export const valorSchema = numeroTexto.refine(
  valorValido,
  "Informe um valor não negativo com até 2 casas decimais.",
)
const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD.")
  .refine((v) => new Date(v).toISOString().slice(0, 10) === v, "Data inválida.")

function itensUnicos<T extends { idProduto: number }>(
  itens: T[],
  ctx: z.RefinementCtx,
) {
  if (idsDuplicados(itens.map((i) => i.idProduto)))
    ctx.addIssue({
      code: "custom",
      message: "Não repita o mesmo insumo na lista de itens.",
    })
}

// -------------------------------------------------------------- listagens
const paginacao = {
  pagina: z.coerce.number().int().min(1).max(100000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  busca: z.string().trim().min(1).max(100).optional(),
  de: diaSchema.optional(),
  ate: diaSchema.optional(),
}
const periodoValido = (v: { de?: string; ate?: string }) =>
  !v.de || !v.ate || v.de <= v.ate
const msgPeriodo = { message: "A data inicial não pode ser posterior à final." }

export const listarRequisicoesSchema = z
  .object({
    ...paginacao,
    status: z
      .enum(["RASCUNHO", "ABERTA", "APROVADA", "ATENDIDA", "CANCELADA"])
      .optional(),
  })
  .strict()
  .refine(periodoValido, msgPeriodo)
export const listarPedidosSchema = z
  .object({
    ...paginacao,
    idFornecedor: z.coerce.number().int().positive().optional(),
    status: z
      .enum(["RASCUNHO", "EMITIDO", "PARCIAL", "RECEBIDO", "CANCELADO"])
      .optional(),
  })
  .strict()
  .refine(periodoValido, msgPeriodo)
export const listarComprasSchema = z
  .object({
    ...paginacao,
    idFornecedor: z.coerce.number().int().positive().optional(),
    idPedidoCompra: z.coerce.number().int().positive().optional(),
    status: z.enum(["RASCUNHO", "EMITIDA", "ENTREGUE", "CANCELADA"]).optional(),
  })
  .strict()
  .refine(periodoValido, msgPeriodo)
export const listarNotasSchema = z
  .object({
    ...paginacao,
    idFornecedor: z.coerce.number().int().positive().optional(),
    idCompra: z.coerce.number().int().positive().optional(),
    status: z.enum(["PENDENTE", "RECEBIDA", "CANCELADA"]).optional(),
  })
  .strict()
  .refine(periodoValido, msgPeriodo)
export const opcoesSchema = z
  .object({
    tipo: z.enum(["insumos", "fornecedores", "locais", "setores"]),
    busca: z.string().trim().max(100).optional(),
    limite: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()

// -------------------------------------------------------- solicitação de compra
const itemRequisicao = z
  .object({
    idProduto: idSchema,
    quantidade: quantidadeSchema,
    observacao: texto(255),
  })
  .strict()
const itensRequisicao = z
  .array(itemRequisicao)
  .min(1, "Adicione ao menos um item.")
  .max(200)
  .superRefine(itensUnicos)
const camposRequisicao = {
  idLocalEstoque: idSchema.nullable().optional(),
  idSetorSolicitante: idSchema.nullable().optional(),
  observacao: texto(255),
  itens: itensRequisicao,
}
export const criarRequisicaoSchema = z
  .object({
    ...camposRequisicao,
    /** true grava já como ABERTA (solicitada); caso contrário, RASCUNHO. */
    enviar: z.boolean().optional(),
  })
  .strict()
export const editarRequisicaoSchema = z.object(camposRequisicao).strict()
export const acaoRequisicaoSchema = z
  .object({ acao: z.enum(["enviar", "aprovar", "cancelar"]) })
  .strict()

// ------------------------------------------------------------ pedido de compra
const itemPedido = z
  .object({
    idProduto: idSchema,
    quantidade: quantidadeSchema,
    valorUnitario: valorSchema,
  })
  .strict()
const camposPedido = {
  idFornecedor: idSchema,
  observacao: texto(255),
  itens: z
    .array(itemPedido)
    .min(1, "Adicione ao menos um item.")
    .max(200)
    .superRefine(itensUnicos),
}
export const criarPedidoSchema = z
  .object({
    ...camposPedido,
    /** Converte uma solicitação APROVADA (que passa a ATENDIDA). */
    idRequisicaoCompra: idSchema.nullable().optional(),
    emitir: z.boolean().optional(),
  })
  .strict()
export const editarPedidoSchema = z.object(camposPedido).strict()
export const acaoPedidoSchema = z
  .object({ acao: z.enum(["emitir", "cancelar"]) })
  .strict()

// ------------------------------------------------------------------- compra
export const criarCompraSchema = z
  .object({
    idPedidoCompra: idSchema.nullable().optional(),
    idFornecedor: idSchema.nullable().optional(),
    idLocalEstoque: idSchema,
    observacao: texto(255),
    itens: z.array(itemPedido).max(200).superRefine(itensUnicos).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.idPedidoCompra) {
      if (v.idFornecedor || v.itens)
        ctx.addIssue({
          code: "custom",
          message:
            "Compra a partir de pedido herda fornecedor e itens do pedido.",
        })
    } else {
      if (!v.idFornecedor)
        ctx.addIssue({ code: "custom", message: "Informe o fornecedor." })
      if (!v.itens?.length)
        ctx.addIssue({ code: "custom", message: "Adicione ao menos um item." })
    }
  })
export const receberCompraSchema = z
  .object({
    /** Quantidades efetivamente recebidas; omitido = recebimento total dos itens da compra. */
    itens: z
      .array(
        z
          .object({ idProduto: idSchema, quantidade: quantidadeSchema })
          .strict(),
      )
      .max(200)
      .superRefine(itensUnicos)
      .optional(),
    observacao: texto(255),
  })
  .strict()
export const acaoCompraSchema = z
  .object({ acao: z.enum(["cancelar"]) })
  .strict()

// -------------------------------------------------------------- nota fiscal
const chaveSchema = z
  .string()
  .trim()
  .transform(normalizarChave)
  .refine(
    chaveAcessoValida,
    "Chave de acesso inválida: informe os 44 dígitos corretos.",
  )
const camposNota = {
  numero: z
    .string()
    .trim()
    .regex(/^\d{1,30}$/, "Número da nota: apenas dígitos (até 30)."),
  serie: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Série: apenas dígitos (até 10)."),
  chaveAcesso: chaveSchema,
  idFornecedor: idSchema,
  idCompra: idSchema.nullable().optional(),
  idPedidoCompra: idSchema.nullable().optional(),
  dataEmissao: diaSchema.nullable().optional(),
  dataRecebimento: diaSchema.nullable().optional(),
  /** Total do documento fiscal. Se omitido e houver compra vinculada, usa o total da compra. */
  valorTotal: valorSchema.optional(),
  observacao: texto(255),
}
export const criarNotaSchema = z.object(camposNota).strict()
export const editarNotaSchema = z.object(camposNota).strict()
export const acaoNotaSchema = z
  .object({
    acao: z.enum(["receber", "cancelar"]),
    dataRecebimento: diaSchema.optional(),
  })
  .strict()

export type ListarRequisicoesInput = z.infer<typeof listarRequisicoesSchema>
export type ListarPedidosInput = z.infer<typeof listarPedidosSchema>
export type ListarComprasInput = z.infer<typeof listarComprasSchema>
export type ListarNotasInput = z.infer<typeof listarNotasSchema>
export type OpcoesInput = z.infer<typeof opcoesSchema>
export type CriarRequisicaoInput = z.infer<typeof criarRequisicaoSchema>
export type EditarRequisicaoInput = z.infer<typeof editarRequisicaoSchema>
export type CriarPedidoInput = z.infer<typeof criarPedidoSchema>
export type EditarPedidoInput = z.infer<typeof editarPedidoSchema>
export type CriarCompraInput = z.infer<typeof criarCompraSchema>
export type ReceberCompraInput = z.infer<typeof receberCompraSchema>
export type CriarNotaInput = z.infer<typeof criarNotaSchema>
export type EditarNotaInput = z.infer<typeof editarNotaSchema>
