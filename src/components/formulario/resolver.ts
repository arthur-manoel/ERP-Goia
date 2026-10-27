import type { FieldErrors, FieldValues, Resolver } from "react-hook-form"
import type { z } from "zod"

/**
 * Chave dos erros que não pertencem a nenhum campo do formulário (por exemplo,
 * um campo do payload que o usuário não edita). Fica fora de `root` de
 * propósito: o react-hook-form ignora `root` ao decidir se o envio é válido.
 */
export const CAMPO_GERAL = "geral"

/**
 * Resolver para formulários cujos valores precisam ser convertidos antes de
 * validar (ex.: texto digitado → payload da API). Reaproveita o schema que o
 * módulo já usa, sem duplicar regras. Devolve ao `aoEnviar` o dado já
 * validado e convertido.
 *
 * `campos` traduz o caminho do schema para o campo do formulário
 * (`razao_social` → `razaoSocial`). Erros sem correspondência vão para
 * `CAMPO_GERAL`.
 */
export function resolverComConversao<
  TForm extends FieldValues,
  TPayload,
>(opcoes: {
  schema: z.ZodType<TPayload>
  converter: (valores: TForm) => unknown
  campos?: Record<string, string>
}): Resolver<TForm, unknown, TPayload> {
  return async (valores) => {
    const resultado = opcoes.schema.safeParse(opcoes.converter(valores))
    if (resultado.success) return { values: resultado.data, errors: {} }
    const erros: Record<string, { type: string; message: string }> = {}
    for (const problema of resultado.error.issues) {
      const caminho = problema.path.map(String).join(".")
      const campo = opcoes.campos?.[caminho] ?? CAMPO_GERAL
      // Mantém a primeira mensagem de cada campo, como o react-hook-form faz.
      erros[campo] ??= { type: problema.code, message: problema.message }
    }
    return { values: {}, errors: erros as FieldErrors<TForm> }
  }
}
