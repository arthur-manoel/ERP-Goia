import { Prisma } from "../../../src/generated/prisma/client"
import type { ContaPagar } from "../../../modules/contas_pagar/repository"
export const input = {
  id_empresa: 10,
  id_compra: 20,
  id_categoria: 30,
  data_vencimento: "2026-11-10",
  valor_original: "100.00",
  valor_desconto: "10.00",
  valor_acrescimo: "5.00",
}
export const row = {
  id: 1,
  id_empresa: 10,
  id_compra: 20,
  id_categoria: 30,
  numero_parcela: 1,
  total_parcelas: 1,
  descricao: "Compra",
  observacao: null,
  data_vencimento: new Date("2026-11-10T00:00:00Z"),
  data_lancamento: new Date("2026-10-24T12:00:00Z"),
  data_cadastro: new Date("2026-10-24T12:00:00Z"),
  data_atualizacao: new Date("2026-10-24T12:00:00Z"),
  valor_original: new Prisma.Decimal(100),
  valor_desconto: new Prisma.Decimal(10),
  valor_acrescimo: new Prisma.Decimal(5),
  valor_final: new Prisma.Decimal(95),
  situacao: "ABERTO",
} satisfies ContaPagar
export const purchase = { id: 20, id_empresa: 10, status: "RASCUNHO" }
