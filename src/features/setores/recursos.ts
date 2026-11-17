import { RECURSOS_PERMISSAO } from "@/lib/permissoes"

export const rotulosRecursos: Record<
  (typeof RECURSOS_PERMISSAO)[number],
  string
> = {
  PRODUTOS: "Produtos",
  ESTOQUE: "Estoque",
  NOTAS_FISCAIS: "Notas fiscais",
  ORDENS_PRODUCAO: "Ordens de produção",
  CORES: "Cores",
  MODELOS: "Modelos",
  CATEGORIAS: "Categorias",
  CLIENTES: "Clientes",
  PEDIDOS: "Pedidos",
  FINANCEIRO: "Financeiro",
  COMPRAS: "Compras",
  FORNECEDORES: "Fornecedores",
  SETORES: "Setores",
  VENDAS: "Vendas",
  RELATORIOS: "Relatórios",
  FLUXOS_PRODUCAO: "Fluxos de produção",
  TAMANHOS: "Tamanhos",
  TIPOS_PRODUTO: "Tipos de produto",
}
export { RECURSOS_PERMISSAO }
