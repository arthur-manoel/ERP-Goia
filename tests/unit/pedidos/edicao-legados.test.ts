import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import {
  editarItem,
  editarPedido,
} from "../../../src/modules/pedidos/pedidos.service"
import { db } from "../../helpers/prisma"

const mocks = vi.hoisted(() => ({
  bloquearRascunho: vi.fn(),
  recalcular: vi.fn(),
  auditar: vi.fn(),
}))
vi.mock(
  "../../../src/modules/pedidos/pedidos.repository",
  async (original) => ({
    ...(await original<
      typeof import("../../../src/modules/pedidos/pedidos.repository")
    >()),
    ...mocks,
  }),
)
const ctx = { idEmpresa: 10, idUsuario: 1 }
const entrega = {
  destinatario: "Cliente anterior",
  telefone_entrega: "85999999999",
  endereco_entrega: "Rua anterior",
  numero_entrega: "123",
  complemento_entrega: "Casa",
  bairro_entrega: "Centro",
  cidade_entrega: "Fortaleza",
  estado_entrega: "CE",
  cep_entrega: "60000000",
  referencia_entrega: "Portão azul",
}
function pedido() {
  return {
    id: 10,
    id_cliente: 12,
    versao: 1,
    id_endereco_entrega: null,
    id_condicao_pagamento: null,
    destinatario: null,
    telefone_entrega: null,
    endereco_entrega: null,
    numero_entrega: null,
    complemento_entrega: null,
    bairro_entrega: null,
    cidade_entrega: null,
    estado_entrega: null,
    cep_entrega: null,
    referencia_entrega: null,
    pedido_cliente_item: [
      {
        id: 20,
        id_produto: 25,
        id_variacao: null,
        quantidade: new Prisma.Decimal("1.000"),
        valor_unitario: new Prisma.Decimal("5000000000000.00"),
        valor_desconto: new Prisma.Decimal("0.01"),
        valor_acrescimo: new Prisma.Decimal("0.00"),
      },
    ],
  }
}
beforeEach(() => {
  mocks.bloquearRascunho.mockResolvedValue(pedido())
  mocks.recalcular.mockResolvedValue({ id: 10, versao: 2 })
  db.clientes.findFirst.mockResolvedValue({ status: "ATIVO" })
  db.pedido_cliente_item.findFirst.mockResolvedValue(null)
  db.produto_empresa.findMany.mockResolvedValue(
    [25, 26].map((id) => ({
      id_produto: id,
      status: "ATIVO",
      id_cor: null,
      id_tamanho: null,
      codigo_interno: null,
      produtos: {
        id,
        status: "ATIVO",
        permite_venda: true,
        produto_variacoes: [],
        codigo: String(id),
        nome: "Produto",
        unidade: "UN",
      },
    })),
  )
})
it.each(Object.entries(entrega))(
  "bloqueia troca de cliente com snapshot de entrega em %s sem FK de endereço",
  async (campo, valor) => {
    mocks.bloquearRascunho.mockResolvedValue({ ...pedido(), [campo]: valor })
    await expect(
      editarPedido(ctx, 10, 1, { idCliente: 13 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mocks.recalcular).not.toHaveBeenCalled()
    expect(mocks.auditar).not.toHaveBeenCalled()
  },
)
it.each(["id_endereco_entrega", "id_condicao_pagamento"])(
  "mantém o bloqueio de troca com %s vinculado",
  async (campo) => {
    mocks.bloquearRascunho.mockResolvedValue({ ...pedido(), [campo]: 30 })
    await expect(
      editarPedido(ctx, 10, 1, { idCliente: 13 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(mocks.recalcular).not.toHaveBeenCalled()
  },
)
it("permite cliente diferente quando não há dados de entrega nem vínculos comerciais", async () => {
  await expect(editarPedido(ctx, 10, 1, { idCliente: 13 })).resolves.toEqual({
    idPedido: 10,
    versao: 2,
  })
  expect(mocks.recalcular).toHaveBeenCalledWith(
    db,
    ctx,
    expect.any(Object),
    expect.objectContaining({ id_cliente: 13 }),
  )
})
it.each([{ idCliente: 12 }, { observacao: "Novo prazo" }])(
  "mantém dados de entrega nas edições sem troca efetiva de cliente: %j",
  async (input) => {
    mocks.bloquearRascunho.mockResolvedValue({ ...pedido(), ...entrega })
    await expect(editarPedido(ctx, 10, 1, input)).resolves.toEqual({
      idPedido: 10,
      versao: 2,
    })
    expect(mocks.recalcular).toHaveBeenCalledTimes(1)
    expect(mocks.auditar).toHaveBeenCalledTimes(1)
  },
)
it.each([
  { input: { quantidade: "2.000" }, quantidade: "1.000" },
  { input: { precoPraticado: "5000000000000.00" }, quantidade: "2.000" },
  { input: { idProduto: 26 }, quantidade: "2.000" },
])(
  "valida líquido legado após desconto, inclusive troca de referência: %j",
  async ({ input, quantidade }) => {
    const antes = pedido()
    antes.pedido_cliente_item[0].quantidade = new Prisma.Decimal(quantidade)
    mocks.bloquearRascunho.mockResolvedValue(antes)
    await expect(editarItem(ctx, 10, 20, 1, input)).resolves.toEqual({
      idPedido: 10,
      idItem: 20,
      versao: 2,
    })
    const data = db.pedido_cliente_item.update.mock.calls[0][0].data
    expect(data.valor_total.toFixed(2)).toBe("9999999999999.99")
    expect(data).not.toHaveProperty("valor_desconto")
    expect(data).not.toHaveProperty("valor_acrescimo")
    expect(mocks.recalcular).toHaveBeenCalledTimes(1)
    expect(mocks.auditar).toHaveBeenCalledTimes(1)
  },
)
it.each([
  { desconto: "0.00", acrescimo: "0.00" },
  { desconto: "0.01", acrescimo: "0.01" },
])(
  "continua rejeitando overflow do líquido legado: %j",
  async ({ desconto, acrescimo }) => {
    const antes = pedido()
    antes.pedido_cliente_item[0].valor_desconto = new Prisma.Decimal(desconto)
    antes.pedido_cliente_item[0].valor_acrescimo = new Prisma.Decimal(acrescimo)
    mocks.bloquearRascunho.mockResolvedValue(antes)
    await expect(
      editarItem(ctx, 10, 20, 1, { quantidade: "2.000" }),
    ).rejects.toMatchObject({ status: 409 })
    expect(db.pedido_cliente_item.update).not.toHaveBeenCalled()
    expect(mocks.recalcular).not.toHaveBeenCalled()
    expect(mocks.auditar).not.toHaveBeenCalled()
  },
)
