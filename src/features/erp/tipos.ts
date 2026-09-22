import { clienteSchema, type Cliente } from "@/features/clientes/schemas"
import { materialSchema, type Material } from "@/features/estoque/schemas"
import {
  lancamentoSchema,
  type Lancamento,
} from "@/features/financeiro/schemas"
import { pedidoSchema, type Pedido } from "@/features/pedidos/schemas"
import {
  ordemProducaoSchema,
  type OrdemProducao,
} from "@/features/producao/schemas"

export type DadosErp = {
  materials: Material[]
  clients: Cliente[]
  productions: OrdemProducao[]
  orders: Pedido[]
  transactions: Lancamento[]
}

export type ColecaoErp = keyof DadosErp

export const schemasErp = {
  materials: materialSchema,
  clients: clienteSchema,
  productions: ordemProducaoSchema,
  orders: pedidoSchema,
  transactions: lancamentoSchema,
}

// Nomes em inglês mantidos somente na fronteira com o estado legado da interface.
export type Data = DadosErp
export type Collection = ColecaoErp
export const schemas = schemasErp
