/**
 * Retorno padrão das Server Actions de formulário, usado com useActionState.
 * `erros` segue o formato de z.flattenError(erro).fieldErrors: { campo: ["mensagem"] }.
 */
export type EstadoFormulario = {
  ok: boolean
  mensagem?: string
  erros?: Record<string, string[] | undefined>
}

export const estadoInicial: EstadoFormulario = { ok: false }
