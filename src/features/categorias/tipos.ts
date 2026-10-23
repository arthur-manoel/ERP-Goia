export type Categoria = {
  id: number
  id_empresa: number | null
  nome: string
  descricao: string | null
  status: "ATIVA" | "INATIVA"
}

export type DadosCategoria = Pick<Categoria, "nome" | "descricao">
