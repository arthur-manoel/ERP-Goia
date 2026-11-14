const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** Valores monetários da API já vêm em decimal fixo com duas casas. */
export function formatarValorCaixa(valor: string) {
  const [parteInteira, centavos] = valor.split(".")
  const inteiro = BigInt(parteInteira)
  // BigInt não conserva o sinal de -0; Number(-0) conserva o sinal para o Intl.
  const numero =
    inteiro === BigInt(0) && parteInteira.startsWith("-") ? -0 : inteiro
  return moeda
    .formatToParts(numero)
    .map((parte) => (parte.type === "fraction" ? centavos : parte.value))
    .join("")
}
