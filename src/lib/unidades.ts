// Regra "a unidade permite casas decimais?" — fonte única do sistema.
//
// As unidades chegam escritas de jeitos diferentes conforme a origem
// ("un.", "UN", "und", "UNIDADE"...), então a comparação ignora caixa, acentos,
// pontos e espaços.

/** Unidades contadas em quantidades inteiras (não existe "2,5 unidades"). */
const UNIDADES_INTEIRAS = new Set([
  "un",
  "und",
  "unid",
  "unidade",
  "unidades",
  "pc",
  "peca",
  "pecas",
  "par",
  "pares",
  "dz",
  "duzia",
  "duzias",
  "cx",
  "caixa",
  "caixas",
  "pct",
  "pacote",
  "pacotes",
  "rolo",
  "rolos",
])

function normalizarUnidade(unidade: string): string {
  return unidade
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[\s.]/g, "")
}

/** `true` quando a unidade só admite quantidade inteira. Unidade vazia/desconhecida admite decimais. */
export function unidadeExigeInteiro(
  unidade: string | null | undefined,
): boolean {
  if (!unidade) return false
  return UNIDADES_INTEIRAS.has(normalizarUnidade(unidade))
}
