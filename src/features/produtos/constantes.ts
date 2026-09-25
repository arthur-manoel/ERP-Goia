export const ITENS_POR_PAGINA = 10

export const situacoesProduto = ["ATIVO", "INATIVO"] as const

export type StatusProduto = (typeof situacoesProduto)[number]
