import { z } from "zod";

const intId = z.number().int().positive().max(2_147_483_647);
const text = z.string().trim().min(1, "Campo obrigatório.");
const flag = z.union([z.literal(0), z.literal(1)], {
  message: "Informe 0 ou 1.",
}).transform((value) => value === 1);
export const statusSchema = z.enum(["ATIVO", "INATIVO"]);

const editableFields = {
  nome: text.max(150, "Nome deve ter no máximo 150 caracteres."),
  descricao: z.string().trim().max(255, "Descrição deve ter no máximo 255 caracteres.").nullable().optional(),
  id_categoria: intId.nullable().optional(),
  id_tipo_produto: intId,
  unidade: text.max(20, "Unidade deve ter no máximo 20 caracteres."),
  controla_estoque: flag,
  permite_compra: flag,
  permite_producao: flag,
  permite_venda: flag,
  status: statusSchema,
};

export const createProdutoSchema = z.object({
  codigo: text.max(100, "Código deve ter no máximo 100 caracteres."),
  ...editableFields,
  status: statusSchema.default("ATIVO"),
}).strict();

// Defaults da criação não devem reativar produtos durante um PUT parcial.
export const updateProdutoSchema = z.object(editableFields).partial().strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Informe pelo menos um campo para atualizar. id e codigo não podem ser alterados.",
  });

export const produtoIdSchema = z.string().regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number).pipe(intId);

export const listProdutosSchema = z.object({
  page: produtoIdSchema.default(1),
  limit: produtoIdSchema.pipe(z.number().max(100, "O limite máximo é 100.")).default(20),
  id_categoria: produtoIdSchema.optional(),
  id_tipo_produto: produtoIdSchema.optional(),
  status: statusSchema.optional(),
  codigo: text.max(100, "Código deve ter no máximo 100 caracteres.").optional(),
}).strict();

export type CreateProdutoData = z.output<typeof createProdutoSchema>;
export type UpdateProdutoData = z.output<typeof updateProdutoSchema>;
export type ProdutoFilters = Pick<z.output<typeof listProdutosSchema>,
  "id_categoria" | "id_tipo_produto" | "status" | "codigo">;
export type Pagination = { page: number; limit: number };
