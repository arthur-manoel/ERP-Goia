/** Remove somente máscara e espaços; letras do CNPJ não podem ser descartadas. */
export function normalizarDocumento(documento: string): string {
  return documento
    .trim()
    .replace(/[.\/\- ]/g, "")
    .toUpperCase()
}

function digito(base: string, pesos: number[]): string {
  const soma = [...base].reduce(
    (total, caractere, index) =>
      total + (caractere.charCodeAt(0) - 48) * pesos[index],
    0,
  )
  const resto = soma % 11
  return String(resto < 2 ? 0 : 11 - resto)
}

export function documentoValido(documento: string): boolean {
  const entrada = documento.trim().toUpperCase()
  const cpf = /^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(entrada)
  const cnpj =
    /^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/.test(
      entrada,
    )
  if (!cpf && !cnpj) return false
  const valor = normalizarDocumento(entrada)
  if (/^(\d)\1+$/.test(valor)) return false
  const base = valor.slice(0, -2)
  const primeiro = digito(
    base,
    cpf ? [10, 9, 8, 7, 6, 5, 4, 3, 2] : [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )
  const segundo = digito(
    base + primeiro,
    cpf
      ? [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )
  return valor.endsWith(primeiro + segundo)
}

export function inferirTipoPessoa(
  documento: string | null,
): "FISICA" | "JURIDICA" | null {
  // Inferência pelo documento, NÃO um dado cadastral real. Sem documento (ou com
  // legado inválido), retorna null mesmo que o cliente seja PF/PJ. Dívida técnica:
  // sugerir ao responsável do banco uma coluna tipo_pessoa independente do documento.
  if (!documento || !documentoValido(documento)) return null
  return normalizarDocumento(documento).length === 11 ? "FISICA" : "JURIDICA"
}
