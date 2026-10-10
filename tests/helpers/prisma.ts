import { vi } from "vitest"
function model() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  }
}
export const db = {
  usuario_empresa: model(),
  tamanhos: model(),
  cores: model(),
  produtos: model(),
  estoque: model(),
  locais_estoque: model(),
  setores: model(),
  produto_empresa: model(),
  auditoria: model(),
  pedido_cliente: model(),
  pedido_cliente_item: { ...model(), createMany: vi.fn(), delete: vi.fn() },
  pedido_cliente_historico: model(),
  produto_variacoes: model(),
  clientes: model(),
  sequencias_automaticas: { ...model(), upsert: vi.fn() },
  $queryRaw: vi.fn(),
  fornecedores: model(),
  $transaction: vi.fn(),
}
