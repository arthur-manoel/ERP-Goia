import {
  validarCadastroCliente,
  validarExclusaoCliente,
} from "@/features/clientes/regras"
import type { Cliente } from "@/features/clientes/schemas"
import {
  validarExclusaoMaterial,
  validarMaterial,
} from "@/features/estoque/regras"
import type { Material } from "@/features/estoque/schemas"
import {
  validarExclusaoLancamento,
  validarLancamento,
} from "@/features/financeiro/regras"
import type { Lancamento } from "@/features/financeiro/schemas"
import { validarPedido } from "@/features/pedidos/regras"
import type { Pedido } from "@/features/pedidos/schemas"
import { validarOrdemProducao } from "@/features/producao/regras"
import type { OrdemProducao } from "@/features/producao/schemas"
import { schemasErp, type ColecaoErp, type DadosErp } from "./tipos"

export function emptyData(): DadosErp {
  return {
    materials: [],
    clients: [],
    productions: [],
    orders: [],
    transactions: [],
  }
}

// Infraestrutura temporária do front-end. Troque este adaptador pelas chamadas à API
// quando o backend estiver disponível; as regras de cada domínio ficam em features/<entidade>.
export function createMockApi(
  latency = 250,
  initialData: DadosErp = emptyData(),
) {
  let data = structuredClone(initialData)
  let failure: string | null = null

  async function request() {
    if (latency) await new Promise((resolve) => setTimeout(resolve, latency))
    if (failure) {
      const message = failure
      failure = null
      throw new Error(message)
    }
  }

  return {
    failNext(
      message = "Não foi possível concluir a operação. Tente novamente.",
    ) {
      failure = message
    },

    async list(): Promise<DadosErp> {
      await request()
      return structuredClone(data)
    },

    async save(
      collection: ColecaoErp,
      values: unknown,
      id?: string,
    ): Promise<DadosErp> {
      await request()
      const parsed = schemasErp[collection].parse(values)

      if (id && !data[collection].some((row) => row.id === id))
        throw new Error("Registro não encontrado. Atualize a página.")

      if (
        "code" in parsed &&
        (data[collection] as Array<{ id: string; code?: string }>).some(
          (row) =>
            row.id !== id &&
            row.code?.toLowerCase() === parsed.code.toLowerCase(),
        )
      )
        throw new Error("Este código já está cadastrado.")

      if (collection === "materials")
        validarMaterial(data, parsed as Omit<Material, "id">, id)
      if (collection === "clients")
        validarCadastroCliente(data, parsed as Omit<Cliente, "id">, id)
      if (collection === "productions")
        validarOrdemProducao(data, parsed as Omit<OrdemProducao, "id">)
      if (collection === "orders")
        validarPedido(data, parsed as Omit<Pedido, "id">, id)
      if (collection === "transactions")
        validarLancamento(data, parsed as Omit<Lancamento, "id">, id)

      const record = { ...parsed, id: id ?? crypto.randomUUID() }
      data = {
        ...data,
        [collection]: id
          ? data[collection].map((row) => (row.id === id ? record : row))
          : [record, ...data[collection]],
      }
      return structuredClone(data)
    },

    async remove(collection: ColecaoErp, id: string): Promise<DadosErp> {
      await request()
      if (!data[collection].some((row) => row.id === id))
        throw new Error("Registro não encontrado.")

      if (collection === "materials") validarExclusaoMaterial(data, id)
      if (collection === "clients") validarExclusaoCliente(data, id)
      if (collection === "transactions") validarExclusaoLancamento(data, id)

      data = {
        ...data,
        [collection]: data[collection].filter((row) => row.id !== id),
      }
      return structuredClone(data)
    },
  }
}

export const api = createMockApi()
