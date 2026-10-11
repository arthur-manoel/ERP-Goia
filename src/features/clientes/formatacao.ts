const somenteDigitos = (valor: string, limite: number) =>
  valor.replace(/\D/g, "").slice(0, limite)

export function formatarCpf(valor: string) {
  const digitos = somenteDigitos(valor, 11)

  return digitos
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export function formatarCnpj(valor: string) {
  const caracteres = valor.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const base = caracteres.slice(0, 12)
  const digitosVerificadores = caracteres
    .slice(12)
    .replace(/\D/g, "")
    .slice(0, 2)
  const documento = `${base}${digitosVerificadores}`.slice(0, 14)

  return documento
    .replace(/^([A-Z0-9]{2})([A-Z0-9])/, "$1.$2")
    .replace(/^([A-Z0-9]{2})\.([A-Z0-9]{3})([A-Z0-9])/, "$1.$2.$3")
    .replace(
      /^([A-Z0-9]{2})\.([A-Z0-9]{3})\.([A-Z0-9]{3})([A-Z0-9])/,
      "$1.$2.$3/$4",
    )
    .replace(/([A-Z0-9]{4})(\d{1,2})$/, "$1-$2")
}

export function formatarDocumento(valor: string, tipo: "PF" | "PJ") {
  return tipo === "PJ" ? formatarCnpj(valor) : formatarCpf(valor)
}

export function formatarTelefone(valor: string) {
  const digitos = somenteDigitos(valor, 11)
  if (!digitos) return ""
  if (digitos.length < 3) return `(${digitos}${digitos.length === 2 ? ")" : ""}`

  const ddd = digitos.slice(0, 2)
  const numero = digitos.slice(2)
  const tamanhoPrefixo = digitos.length === 11 ? 5 : 4
  const prefixo = numero.slice(0, tamanhoPrefixo)
  const sufixo = numero.slice(tamanhoPrefixo)

  return `(${ddd}) ${prefixo}${sufixo ? `-${sufixo}` : ""}`
}

export function formatarCep(valor: string) {
  const digitos = somenteDigitos(valor, 8)
  return digitos.replace(/^(\d{5})(\d)/, "$1-$2")
}
