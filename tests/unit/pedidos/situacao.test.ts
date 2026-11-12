import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { Prisma } from "../../../src/generated/prisma/client"
import { consultarSituacao } from "../../../src/modules/pedidos/pedidos.situacao"

it("consulta a empresa e calcula a reserva restante sem inferir OP por produto", async () => {
  const d = (v: number) => new Prisma.Decimal(v)
  const ordem = { id: 8, numero: "OP-8", status: "EM_PRODUCAO" }
  db.pedido_cliente.count.mockResolvedValue(1)
  db.pedido_cliente.findMany
    .mockResolvedValueOnce([
      {
        id: 2,
        numero: "P-2",
        status: "CONFIRMADO",
        data_pedido: new Date(),
        valor_total: d(10),
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 2,
        numero: "P-2",
        status: "CONFIRMADO",
        clientes: { nome_razao_social: "Cliente" },
        ordem_producao: [ordem],
        pedido_cliente_item: [
          {
            id: 3,
            descricao: "Camisa",
            id_produto: 4,
            id_variacao: 5,
            quantidade: d(10),
            cores: { nome: "Azul" },
            tamanhos: { nome: "P" },
            reserva_estoque: [
              {
                id_produto: 4,
                id_variacao: 5,
                quantidade: d(8),
                quantidade_consumida: d(2),
                quantidade_liberada: d(1),
              },
              {
                id_produto: 4,
                id_variacao: 6,
                quantidade: d(99),
                quantidade_consumida: d(0),
                quantidade_liberada: d(0),
              },
            ],
            ordem_producao_item: [{ ordem_producao: ordem }],
          },
        ],
      },
    ])
  const resultado = await consultarSituacao(
    { idEmpresa: 10, idUsuario: 1 },
    { pagina: 1, limite: 25, status: "CONFIRMADO", busca: "P-2" },
  )
  expect(resultado.dados[0]).toMatchObject({
    status: "CONFIRMADO",
    reservada: "5.000",
    quantidade: "10.000",
    item: "Camisa — Azul — P",
    ordens: [ordem],
  })
  expect(db.pedido_cliente.count).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id_empresa: 10, status: "CONFIRMADO" }),
    }),
  )
  const consulta = db.pedido_cliente.findMany.mock.calls[1][0]
  expect(consulta.where).toEqual({ id_empresa: 10, id: { in: [2] } })
  expect(
    consulta.include.pedido_cliente_item.include.reserva_estoque.where,
  ).toEqual({ id_empresa: 10, status: "ATIVA" })
  expect(db.reserva_estoque.create).not.toHaveBeenCalled()
})

it("retorna lista vazia com paginação quando não há pedidos", async () => {
  db.pedido_cliente.count.mockResolvedValue(0)
  db.pedido_cliente.findMany.mockResolvedValue([])
  const resultado = await consultarSituacao(
    { idEmpresa: 10, idUsuario: 1 },
    { pagina: 1, limite: 25 },
  )
  expect(resultado.dados).toEqual([])
  expect(resultado.paginacao.totalRegistros).toBe(0)
})
