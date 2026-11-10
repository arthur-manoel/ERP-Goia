import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { consultarOpcoes } from "../../../src/modules/pedidos/pedidos.opcoes"

it("mantém grade histórica e filtra variações inativas ou de outra empresa", async () => {
  db.clientes.findMany.mockResolvedValue([
    { id: 4, nome_razao_social: "Cliente" },
  ])
  const variacao = {
    id: 1,
    id_cor: 2,
    id_tamanho: 3,
    status: "ATIVO",
    cores: { nome: "Azul", status: "ATIVA", id_empresa: null },
    tamanhos: { nome: "P", status: "ATIVO", id_empresa: 10 },
  }
  db.produto_empresa.findMany.mockResolvedValue([
    {
      id_produto: 5,
      id_cor: null,
      id_tamanho: null,
      preco_venda: { toFixed: () => "25.50" },
      produtos: {
        nome: "Camisa",
        codigo: "C1",
        produto_variacoes: [
          variacao,
          { ...variacao, id: 2, status: "INATIVO" },
          {
            ...variacao,
            id: 3,
            tamanhos: { ...variacao.tamanhos, id_empresa: 20 },
          },
        ],
      },
    },
  ])
  const resultado = await consultarOpcoes(
    { idEmpresa: 10, idUsuario: 1 },
    "Camisa",
  )
  expect(db.clientes.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id_empresa: 10, status: "ATIVO" }),
    }),
  )
  expect(db.produto_empresa.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_empresa: 10,
        status: "ATIVO",
        produtos: expect.objectContaining({
          permite_venda: true,
          status: "ATIVO",
        }),
      }),
    }),
  )
  expect(resultado.produtos[0]).toEqual({
    id: 5,
    nome: "Camisa",
    codigo: "C1",
    preco: "25.50",
    temGrade: true,
    variacoes: [{ id: 1, cor: "Azul", tamanho: "P" }],
  })
})
