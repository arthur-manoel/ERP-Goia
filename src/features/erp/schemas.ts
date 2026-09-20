// Camada de compatibilidade para integrações existentes.
// A implementação pertence a cada domínio em features/<entidade>.
export {
  materialSchema,
  unidades,
  unidadeInteira,
  calcularVenda,
  type Material,
} from "@/features/estoque/schemas"
export {
  clienteSchema as clientSchema,
  enderecoSchema as addressSchema,
  tiposEndereco as addressTypes,
  type Cliente as Client,
} from "@/features/clientes/schemas"
export {
  ordemProducaoSchema as productionSchema,
  type OrdemProducao as Production,
} from "@/features/producao/schemas"
export {
  pedidoSchema as orderSchema,
  totalPedido as orderTotal,
  type Pedido as Order,
} from "@/features/pedidos/schemas"
export {
  lancamentoSchema as transactionSchema,
  type Lancamento as Transaction,
} from "@/features/financeiro/schemas"
export { schemas, schemasErp, type Collection, type Data } from "./tipos"
export { hoje as today, rotuloData as dateLabel } from "./datas"
export { formatarMoeda as brl } from "@/lib/formatacao"
