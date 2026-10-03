// Contratos da API /api/compras/* (espelham os view models de modules/compras/compras.service.ts).
export type Permissoes = {
  ler: boolean
  criar: boolean
  editar: boolean
  excluir: boolean
}
export type PaginacaoApi = {
  pagina: number
  limite: number
  total: number
  totalPaginas: number
}
export type Opcao = {
  id: number
  nome: string
  codigo: string | null
  unidade: string | null
}
export type Pessoa = { id: number; nome: string }
export type Entidade = { id: number; nome: string; razaoSocial: string }

export type StatusRequisicao =
  "RASCUNHO" | "ABERTA" | "APROVADA" | "ATENDIDA" | "CANCELADA"
export type StatusPedido =
  "RASCUNHO" | "EMITIDO" | "PARCIAL" | "RECEBIDO" | "CANCELADO"
export type StatusCompra = "RASCUNHO" | "EMITIDA" | "ENTREGUE" | "CANCELADA"
export type StatusNota = "PENDENTE" | "RECEBIDA" | "CANCELADA"

export type Requisicao = {
  id: number
  numero: string
  status: StatusRequisicao
  dataSolicitacao: string
  solicitante: Pessoa
  setor: string | null
  idLocalEstoque: number | null
  idSetorSolicitante: number | null
  local: string | null
  observacao: string | null
  totalItens: number
}
export type RequisicaoDetalhe = Requisicao & {
  itens: Array<{
    id: number
    idProduto: number
    codigo: string
    nome: string
    unidade: string
    quantidade: string
    observacao: string | null
  }>
  pedidos: Array<{ id: number; numero: string; status: StatusPedido }>
}

export type Pedido = {
  id: number
  numero: string
  status: StatusPedido
  dataPedido: string
  fornecedor: Entidade
  responsavel: Pessoa
  requisicao: { id: number; numero: string } | null
  compra: { id: number; codigo: string; status: StatusCompra } | null
  observacao: string | null
  totalItens: number
  valorTotal: string
  notasFiscais: number
}
export type PedidoDetalhe = Pedido & {
  itens: Array<{
    id: number
    idProduto: number
    codigo: string
    nome: string
    unidade: string
    quantidadePedida: string
    quantidadeRecebida: string
    quantidadePendente: string
    valorUnitario: string
    valorTotal: string
  }>
}

export type Compra = {
  id: number
  codigo: string
  status: StatusCompra
  origem: "MANUAL" | "ORDEM_PRODUCAO"
  dataEmissao: string
  dataAtualizacao: string
  fornecedor: Entidade
  responsavel: Pessoa
  local: Pessoa
  pedido: { id: number; numero: string } | null
  observacao: string | null
  totalItens: number
  valorTotal: string
  notasFiscais: number
}
export type CompraDetalhe = Compra & {
  itens: Array<{
    id: number
    idProduto: number
    codigo: string
    nome: string
    unidade: string
    quantidade: string
    valorUnitario: string
    valorTotal: string
    quantidadePedida: string | null
    quantidadeRecebida: string
    quantidadePendente: string | null
  }>
  notas: Array<{
    id: number
    numero: string
    serie: string
    status: StatusNota
  }>
}

export type Nota = {
  id: number
  numero: string
  serie: string
  chaveAcesso: string
  status: StatusNota
  dataEmissao: string | null
  dataRecebimento: string | null
  valorTotal: string
  fornecedor: Entidade
  compra: { id: number; codigo: string } | null
  pedido: { id: number; numero: string } | null
  entradaProcessada: boolean
  observacao: string | null
}

export type Lista<K extends string, T, R> = { [P in K]: T[] } & {
  paginacao: PaginacaoApi
  resumo: R
  permissoes: Permissoes
}
export type ResumoStatus = { porStatus: Record<string, number> }
