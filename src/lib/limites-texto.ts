import { z } from "zod"

export const LIMITE_TEXT_MYSQL_BYTES = 65_535

// TEXT limita bytes, enquanto z.string().max() conta unidades UTF-16.
// TextEncoder funciona também nos schemas compartilhados com o navegador.
export function cabeEmTextMysql(texto: string): boolean {
  return new TextEncoder().encode(texto).byteLength <= LIMITE_TEXT_MYSQL_BYTES
}

export const textoMysqlSchema = z
  .string()
  .max(LIMITE_TEXT_MYSQL_BYTES)
  .refine(cabeEmTextMysql, {
    message: "Observação deve ocupar no máximo 65.535 bytes em UTF-8.",
  })

/** Valida o JSON final, incluindo escapes, sem cortar ou modificar o conteúdo. */
export function serializarJsonTextMysql(
  valor: unknown,
  criarErro: (mensagem: string) => Error,
): string {
  const texto = JSON.stringify(valor)
  if (texto === undefined || !cabeEmTextMysql(texto))
    throw criarErro(
      "O conteúdo da auditoria excede o limite de 65.535 bytes em UTF-8. Reduza os textos ou a quantidade de itens da operação.",
    )
  return texto
}
