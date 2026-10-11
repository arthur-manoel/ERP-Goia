// Regras compartilhadas de limite de caracteres. Sem dependência de React/Zod:
// pode ser usada em schemas, em validações manuais e em componentes.

/**
 * Limites de caracteres por tipo de campo. Quando o campo é gravado no banco,
 * o valor acompanha o tamanho da coluna (ver prisma/schema.prisma) para que um
 * texto aceito na tela nunca seja recusado depois pelo banco.
 */
export const LIMITES = {
  /** Nomes e códigos em geral (limite histórico do sistema). */
  nome: 120,
  /** setores.nome é VarChar(100). */
  nomeSetor: 100,
  /** setores.tipo é VarChar(80). */
  tipoSetor: 80,
  /** setores.descricao e descrição do fluxo: VarChar(255). */
  descricaoCurta: 255,
  /** Descrições e observações longas já existentes (produto, ordem de produção). */
  descricaoLonga: 500,
  /** movimentacao_estoque.observacao é VarChar(255). */
  observacaoMovimentacao: 255,
  /** Campos de busca/filtro: não precisam de mais que isso. */
  busca: 100,
} as const

/**
 * Teto de digitação do navegador (`maxLength`). É propositalmente maior que o
 * limite de validação: assim, ao colar um texto um pouco maior, o usuário vê o
 * contador vermelho e a mensagem de erro em vez de ter o texto cortado em
 * silêncio. Também impede que alguém cole megabytes de texto na tela.
 */
export function tetoDigitacao(limite: number): number {
  return limite * 3
}

/** Tamanho que conta para o limite: o mesmo do schema (`trim().max()`). */
export function tamanhoTexto(valor: string | null | undefined): number {
  return (valor ?? "").trim().length
}

export function excedeLimite(
  valor: string | null | undefined,
  limite: number,
): boolean {
  return tamanhoTexto(valor) > limite
}

/** "Use no máximo 255 caracteres." */
export function mensagemLimite(limite: number): string {
  return `Use no máximo ${limite} caracteres.`
}

/** "Use no máximo 255 caracteres. Remova 12 caracteres." (para exibir ao vivo) */
export function mensagemExcesso(
  valor: string | null | undefined,
  limite: number,
): string {
  const excesso = tamanhoTexto(valor) - limite
  return `${mensagemLimite(limite)} Remova ${excesso} ${
    excesso === 1 ? "caractere" : "caracteres"
  }.`
}
