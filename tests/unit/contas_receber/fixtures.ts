import { Prisma } from "../../../src/generated/prisma/client"
import type { ContaReceber } from "../../../modules/contas_receber/repository"

export const input = {
  id_empresa: 10,
  id_venda: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: "100.00",
  valor_desconto: "5.00",
  valor_acrescimo: "2.00",
}
export const row = {
  id: 1,
  id_empresa: 10,
  id_venda: 20,
  id_categoria: 30,
  id_fechamento: null,
  numero_parcela: 1,
  total_parcelas: 1,
  descricao: "Venda",
  observacao: null,
  data_vencimento: new Date("2026-11-10T00:00:00Z"),
  data_lancamento: new Date("2026-10-24T12:00:00Z"),
  data_cadastro: new Date("2026-10-24T12:00:00Z"),
  data_atualizacao: new Date("2026-10-24T12:00:00Z"),
  valor_original: new Prisma.Decimal(100),
  valor_desconto: new Prisma.Decimal(5),
  valor_acrescimo: new Prisma.Decimal(2),
  valor_final: new Prisma.Decimal(93),
  saldo: new Prisma.Decimal(93),
  situacao: "ABERTO",
} satisfies ContaReceber
export const sale = {
  id: 20,
  id_empresa: 10,
  status: "CONFIRMADA",
  status_financeiro: "NAO_FATURADA",
  pedido_cliente: null,
  _count: { pedido_cliente_fechamento: 0 },
}
