// CNPJ: módulo 11, incluindo o formato alfanumérico publicado pela Receita Federal.
export const normalizarDocumento = (value: string) =>
  value.replace(/[.\/\-\s]/g, "").toUpperCase()

export function cpfValido(value: string) {
  const digits = normalizarDocumento(value)
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false
  for (const length of [9, 10]) {
    const sum = [...digits.slice(0, length)].reduce(
      (total, char, index) => total + Number(char) * (length + 1 - index),
      0,
    )
    const rest = sum % 11
    if (Number(digits[length]) !== (rest < 2 ? 0 : 11 - rest)) return false
  }
  return true
}

export function cnpjValido(value: string) {
  const digits = normalizarDocumento(value)
  if (!/^[A-Z\d]{12}\d{2}$/.test(digits) || /^(\d)\1+$/.test(digits))
    return false
  for (const length of [12, 13]) {
    const sum = [...digits.slice(0, length)].reduce(
      (total, char, index) =>
        total + (char.charCodeAt(0) - 48) * (((length - 1 - index) % 8) + 2),
      0,
    )
    const rest = sum % 11
    if (Number(digits[length]) !== (rest < 2 ? 0 : 11 - rest)) return false
  }
  return true
}
