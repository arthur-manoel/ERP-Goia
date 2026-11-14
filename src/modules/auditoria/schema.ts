import { z } from "zod"

const inteiro = z.coerce.number().int().min(1).max(2_147_483_647)
const dia = z.iso.date()
export const cursorAuditoriaSchema = z
  .string()
  .max(80)
  .refine(
    (value) => {
      const [data, id, extra] = value.split("|")
      return (
        extra === undefined &&
        z.iso.datetime().safeParse(data).success &&
        /^[1-9]\d*$/.test(id ?? "") &&
        inteiro.safeParse(id).success
      )
    },
    { message: "Cursor de auditoria inválido." },
  )
export function lerCursorAuditoria(cursor: string) {
  const [data, id] = cursor.split("|")
  return { data: new Date(data), id: Number(id) }
}
export const acoesAuditoria = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
] as const
export const filtrosAuditoria = z
  .strictObject({
    inicio: dia.optional(),
    fim: dia.optional(),
    usuario: inteiro.optional(),
    tabela: z.string().trim().min(1).max(100).optional(),
    registro: inteiro.optional(),
    acao: z.enum(acoesAuditoria).optional(),
    pagina: inteiro.max(100_000).default(1),
    cursor: cursorAuditoriaSchema.optional(),
  })
  .refine(
    (v) => (v.pagina === 1 ? v.cursor === undefined : v.cursor !== undefined),
    {
      message: "Use o cursor da página anterior para continuar a consulta.",
    },
  )
  .refine((v) => !v.inicio || !v.fim || v.inicio <= v.fim, {
    message: "A data inicial deve ser anterior ou igual à final.",
  })

/** Datas do filtro representam dias no fuso da empresa (Fortaleza). */
export function periodoAuditoria(inicio?: string, fim?: string) {
  return {
    ...(inicio ? { gte: new Date(`${inicio}T00:00:00-03:00`) } : {}),
    ...(fim
      ? {
          lt: new Date(
            new Date(`${fim}T00:00:00-03:00`).getTime() + 86_400_000,
          ),
        }
      : {}),
  }
}

const sigilo = /senha|password|token|secret|authorization|cookie/i
export function ocultarSegredos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ocultarSegredos)
  if (valor && typeof valor === "object")
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [
        k,
        sigilo.test(k) ? "[oculto]" : ocultarSegredos(v),
      ]),
    )
  return valor
}
export function lerSnapshot(texto: string | null, idEmpresa?: number): unknown {
  if (texto === null) return null
  try {
    const dados = JSON.parse(texto)
    // Protege também eventos legados de transferência já gravados com os dois lados.
    if (
      idEmpresa !== undefined &&
      dados &&
      typeof dados === "object" &&
      !Array.isArray(dados) &&
      dados.id_empresa != null &&
      Number(dados.id_empresa) !== idEmpresa
    )
      return null
    return ocultarSegredos(dados)
  } catch {
    return "Conteúdo legado não estruturado (indisponível para exibição segura)."
  }
}
