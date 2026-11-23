import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import type { Transaction } from "../../../src/modules/pedidos/pedidos.repository"
import { prepararEntrega } from "../../../src/modules/pedidos/pedidos.service"
import {
  editarEndereco,
  enderecoEditarSchema,
} from "../../../src/modules/clientes/clientes-vinculos"

const cliente = {
  id: 3,
  id_empresa: 10,
  status: "ATIVO",
  nome_razao_social: "Cliente de teste",
  telefone: "85999990000",
  endereco: "Rua da matriz",
  numero: "100",
  complemento: "Sala 2",
  bairro: "Centro",
  cidade: "Fortaleza",
  estado: "CE",
  cep: "60000000",
}
const enderecoGalpao = {
  id: 8,
  id_cliente: cliente.id,
  tipo: "ENTREGA",
  endereco: "Rua do galpão",
  numero: null,
  complemento: null,
  bairro: "Distrito",
  cidade: "Maracanaú",
  estado: "CE",
  cep: null,
  referencia: null,
  principal: false,
  ativo: true,
}
const contexto = { idEmpresa: 10, idUsuario: 5, podeExcluir: false }

it("pedido usa só os campos do endereço de entrega selecionado, inclusive vazios", async () => {
  db.clientes.findFirst.mockResolvedValue(cliente)
  db.cliente_endereco.findFirst.mockResolvedValue(enderecoGalpao)
  db.cliente_contato.findFirst.mockResolvedValue({ valor: "85999991111" })

  const entrega = await prepararEntrega(
    db as unknown as Transaction,
    { idEmpresa: 10, idUsuario: 5 },
    cliente.id,
    enderecoGalpao.id,
  )

  expect(entrega).toMatchObject({
    id_endereco_entrega: enderecoGalpao.id,
    endereco_entrega: "Rua do galpão",
    numero_entrega: null,
    complemento_entrega: null,
    bairro_entrega: "Distrito",
    cidade_entrega: "Maracanaú",
    estado_entrega: "CE",
    cep_entrega: null,
    referencia_entrega: null,
    telefone_entrega: "85999991111",
  })
  expect(db.cliente_endereco.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id: enderecoGalpao.id,
        id_cliente: cliente.id,
        tipo: { in: ["PRINCIPAL", "ENTREGA"] },
      }),
    }),
  )
})

it("seleção automática considera finalidade e não retorna endereço de cobrança", async () => {
  db.clientes.findFirst.mockResolvedValue(cliente)
  db.cliente_endereco.findFirst.mockResolvedValue(null)
  db.cliente_contato.findFirst.mockResolvedValue(null)

  const entrega = await prepararEntrega(
    db as unknown as Transaction,
    { idEmpresa: 10, idUsuario: 5 },
    cliente.id,
  )

  expect(db.cliente_endereco.findFirst).toHaveBeenCalledWith({
    where: {
      id_cliente: cliente.id,
      ativo: true,
      clientes: { id_empresa: 10 },
      tipo: { in: ["PRINCIPAL", "ENTREGA"] },
    },
    orderBy: [{ principal: "desc" }, { id: "asc" }],
  })
  expect(entrega.id_endereco_entrega).toBeNull()
})

it("PATCH de endereço mantém tipo e principal omitidos, mas aplica null explícito", async () => {
  const antes = {
    ...enderecoGalpao,
    tipo: "PRINCIPAL",
    principal: true,
    descricao: "Matriz",
  }
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.clientes.findFirst.mockResolvedValue({ id: cliente.id })
  db.cliente_endereco.findFirst.mockResolvedValue(antes)
  db.cliente_endereco.update.mockResolvedValue({
    ...antes,
    descricao: "Matriz atualizada",
  })
  db.auditoria.create.mockResolvedValue({})

  expect(
    enderecoEditarSchema.parse({ descricao: "Matriz atualizada" }),
  ).toEqual({ descricao: "Matriz atualizada" })

  await editarEndereco(contexto, cliente.id, antes.id, {
    descricao: "Matriz atualizada",
  })

  const atualizacao = db.cliente_endereco.update.mock.calls[0][0].data
  expect(atualizacao).toEqual({ descricao: "Matriz atualizada" })
  expect(atualizacao).not.toHaveProperty("tipo")
  expect(atualizacao).not.toHaveProperty("principal")
})

it("PATCH permite limpar um campo anulável sem preencher outros com padrões", async () => {
  const antes = {
    ...enderecoGalpao,
    tipo: "ENTREGA",
    complemento: "Bloco B",
  }
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.clientes.findFirst.mockResolvedValue({ id: cliente.id })
  db.cliente_endereco.findFirst.mockResolvedValue(antes)
  db.cliente_endereco.update.mockResolvedValue({ ...antes, complemento: null })
  db.auditoria.create.mockResolvedValue({})

  await editarEndereco(contexto, cliente.id, antes.id, { complemento: null })

  expect(db.cliente_endereco.update).toHaveBeenCalledWith({
    where: { id: antes.id },
    data: { complemento: null },
  })
  expect(db.cliente_endereco.updateMany).not.toHaveBeenCalled()
})
