import { z } from "zod"
import { RECURSOS_PERMISSAO } from "@/lib/permissoes"

const idSchema = z.number().int().positive().max(2147483647)
const emailSchema = z
  .string()
  .trim()
  .max(150)
  .pipe(z.email())
  .transform((value) => value.toLowerCase())
const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .max(128)
const permissaoSchema = z.strictObject({
  recurso: z.enum(RECURSOS_PERMISSAO),
  pode_ler: z.boolean(),
  pode_criar: z.boolean(),
  pode_editar: z.boolean(),
  pode_excluir: z.boolean(),
})
const permissaoLista = z
  .array(permissaoSchema)
  .max(RECURSOS_PERMISSAO.length)
  .superRefine((items, ctx) => {
    const vistos = new Set<string>()
    items.forEach((item, index) => {
      if (vistos.has(item.recurso))
        ctx.addIssue({
          code: "custom",
          path: [index, "recurso"],
          message: "Não repita recursos nas permissões.",
        })
      vistos.add(item.recurso)
    })
  })

export const criarUsuarioSchema = z.strictObject({
  nome: z.string().trim().min(1).max(150),
  email: emailSchema,
  password: passwordSchema,
  idCargo: idSchema,
  idSetor: idSchema.nullable().optional(),
  permissoes: permissaoLista.optional(),
})
export type CriarUsuarioInput = z.infer<typeof criarUsuarioSchema>

export const vincularUsuarioSchema = z.strictObject({
  email: emailSchema,
  idCargo: idSchema,
  idSetor: idSchema.nullable().optional(),
})

export const editarUsuarioSchema = z
  .strictObject({
    nome: z.string().trim().min(1).max(150).optional(),
    email: emailSchema.optional(),
    idCargo: idSchema.optional(),
    idSetor: idSchema.nullable().optional(),
    statusVinculo: z.enum(["ATIVO", "INATIVO"]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "Informe ao menos um campo.",
  )

export const editarPermissoesSchema = z.strictObject({
  permissoes: permissaoLista,
})
export const redefinirSenhaSchema = z.strictObject({ password: passwordSchema })
export const trocarSenhaSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  password: passwordSchema,
})

const queryId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(idSchema)
const queryInt = (defaultValue: number, max: number) =>
  z
    .string()
    .regex(/^[1-9]\d*$/)
    .optional()
    .transform((value) => (value === undefined ? defaultValue : Number(value)))
    .pipe(z.number().int().positive().max(max))
export const listarUsuariosSchema = z.strictObject({
  busca: z.string().trim().max(150).optional(),
  status: z.enum(["TODOS", "ATIVO", "INATIVO"]).optional().default("TODOS"),
  idCargo: queryId.optional(),
  idSetor: z
    .union([queryId, z.literal("SEM_SETOR").transform(() => null)])
    .optional(),
  pagina: queryInt(1, 2147483647),
  limite: queryInt(20, 100),
})

export type EditarUsuarioInput = z.infer<typeof editarUsuarioSchema>
export type VincularUsuarioInput = z.infer<typeof vincularUsuarioSchema>
export type PermissaoInput = z.infer<typeof permissaoSchema>
export type ListarUsuariosInput = z.infer<typeof listarUsuariosSchema>
