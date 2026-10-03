// Lista temporária do front-end. O sistema já modela usuários, cargos e
// setores (ver módulo de autenticação e "usuario_empresa"), mas ainda não há
// uma API que devolva quem pode ser responsável por uma ordem de produção.
// Troque esta lista por uma consulta aos usuários ativos do setor de
// produção assim que o endpoint existir; o restante da tela (seleção,
// validação e exibição) não precisa mudar, pois só depende do formato
// { id, name } abaixo.
export type Responsavel = {
  id: string
  name: string
}

export const responsaveisDisponiveis: Responsavel[] = [
  { id: "responsavel-1", name: "Ana Ribeiro" },
  { id: "responsavel-2", name: "Carlos Menezes" },
  { id: "responsavel-3", name: "Fernanda Souza" },
  { id: "responsavel-4", name: "Juliano Prado" },
]

export const nomeResponsavel = (id: string) =>
  responsaveisDisponiveis.find((row) => row.id === id)?.name ??
  "Responsável não encontrado"
