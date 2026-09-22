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
  tamanhos: model(),
  cores: model(),
  produtos: model(),
  $transaction: vi.fn(),
}
