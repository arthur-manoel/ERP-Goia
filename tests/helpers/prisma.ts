import { vi } from "vitest"
function model() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
  }
}
export const db = {
  usuario_empresa: model(),
  tamanhos: model(),
  cores: model(),
  produtos: model(),
  tipos_produto: model(),
  fornecedores: model(),
  $transaction: vi.fn(),
}
