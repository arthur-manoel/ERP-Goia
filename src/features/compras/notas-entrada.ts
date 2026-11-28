import type { Nota } from "./tipos"
export type ItemNota = {
  id?: number
  numeroItem: number
  codigo: string | null
  descricao: string | null
  idProduto: number | null
  idCompraItem: number | null
  idVariacao: number | null
  idLocalEstoque: number | null
  idSetor: number | null
  setorNome?: string | null
  localNome?: string | null
  quantidade: string
  unidade: string
  tipoValor: "UNITARIO" | "METRO" | "TOTAL"
  valorUnitario: string
  valorTotal: string
  valorReferenciaCompra?: string | null
  divergenciaCompra?: boolean
  pendencias?: string[]
}
export type NotaDetalhe = Nota & {
  itens: ItemNota[]
  justificativaValores: string | null
  somatorioItens: string
  pendencias: string[]
  alocacoes: {
    id_item_nota: number
    id_movimentacao: number
    quantidade: string
  }[]
  compraConferencia: {
    id: number
    status: string
    idLocalEstoque: number
    itens: {
      id: number
      idProduto: number
      idCor: number | null
      idTamanho: number | null
      nome: string
      unidade: string
      quantidade: string
      recebida: string
      pendente: string
      valorUnitario: string
      variacoes: {
        id: number
        idCor: number | null
        idTamanho: number | null
        nome: string
      }[]
    }[]
    recebimentos: {
      idMovimentacao: number
      idCompraItem: number | null
      idProduto: number
      idVariacao: number | null
      idLocalEstoque: number | null
      idSetor: number | null
      quantidade: string
      livre: string
      valorTotal: string
      responsavel: number
      data: string
    }[]
  } | null
}
