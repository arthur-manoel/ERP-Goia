const origemInterna = "https://erp-goia.invalid"

export function retornoSeguro(valor: string | string[] | undefined) {
  const retorno = Array.isArray(valor) ? valor[0] : valor
  if (
    !retorno?.startsWith("/") ||
    retorno.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(retorno) ||
    /%(?:2f|5c)/i.test(retorno.split(/[?#]/, 1)[0])
  ) {
    return "/"
  }

  try {
    const url = new URL(retorno, origemInterna)
    if (
      url.origin !== origemInterna ||
      url.pathname.startsWith("//") ||
      /^\/login(?:\/|$)/i.test(url.pathname)
    ) {
      return "/"
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/"
  }
}
