import { expect, it, vi } from "vitest"
import {
  alterarStatusCliente,
  camposCliente,
  consultarCliente,
  filtrosIniciais,
  historicoCliente,
  listarClientes,
  prepararCliente,
  salvarCliente,
  type ClienteApi,
} from "../../../src/features/clientes/api"
import {
  criarSchema,
  editarSchema,
} from "../../../src/modules/clientes/clientes.schema"

const cliente: ClienteApi = {
  id: 3,
  id_empresa: 10,
  nome_razao_social: "Cliente de teste",
  cpf_cnpj: "52998224725",
  email: "cliente@example.test",
  telefone: null,
  endereco: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  cep: null,
  status: "ATIVO",
  data_cadastro: "2026-10-30T12:00:00.000Z",
  tipoPessoa: "FISICA",
}
const paginacao = { pagina: 2, limite: 10, total: 21, totalPaginas: 3 }
const ok = (body: unknown) => Response.json(body)

it("usa nome, documento completo, status e paginação do servidor e envia empresa apenas no header", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValue(ok({ clientes: [cliente], paginacao }))
  const signal = new AbortController().signal
  const result = await listarClientes(
    requisitar,
    10,
    { nome: "  Cliente  ", cpfCnpj: "529.982.247-25", status: "ATIVO" },
    2,
    signal,
  )
  const [url, init] = requisitar.mock.calls[0]
  const params = new URL(url, "http://localhost").searchParams
  expect(Object.fromEntries(params)).toEqual({
    nome: "Cliente",
    cpfCnpj: "52998224725",
    status: "ATIVO",
    pagina: "2",
    limite: "10",
  })
  expect(init.headers.get("X-Empresa-Id")).toBe("10")
  expect(init.signal).toBe(signal)
  expect(result.paginacao.total).toBe(21)
  expect(result.clientes).toHaveLength(1)
})

it("busca vazia não envia parâmetros vazios nem inventa um envelope success/data", async () => {
  const requisitar = vi.fn().mockResolvedValue(
    ok({
      clientes: [],
      paginacao: { pagina: 1, limite: 10, total: 0, totalPaginas: 0 },
    }),
  )
  expect(
    (await listarClientes(requisitar, 10, filtrosIniciais, 1)).clientes,
  ).toEqual([])
  expect(
    Object.fromEntries(
      new URL(requisitar.mock.calls[0][0], "http://localhost").searchParams,
    ),
  ).toEqual({ pagina: "1", limite: "10" })
})

it("cadastra somente com nome e manda null para os campos opcionais vazios", async () => {
  const requisitar = vi.fn().mockResolvedValue(ok({ cliente }))
  await salvarCliente(requisitar, 10, {
    ...camposCliente(),
    nomeRazaoSocial: " Cliente ",
  })
  const [url, init] = requisitar.mock.calls[0]
  const body = JSON.parse(init.body)
  expect(url).toBe("/api/clientes")
  expect(init.method).toBe("POST")
  expect(criarSchema.safeParse(body).success).toBe(true)
  expect(body.nomeRazaoSocial).toBe("Cliente")
  expect(body.cpfCnpj).toBeNull()
  expect(body.email).toBeNull()
  expect(body).not.toHaveProperty("id_empresa")
  expect(body).not.toHaveProperty("tipoPessoa")
  expect(body).not.toHaveProperty("status")
})

it("preserva letras do CNPJ alfanumérico, normaliza UF e CEP conforme a API", () => {
  const payload = prepararCliente({
    ...camposCliente(),
    nomeRazaoSocial: "Empresa",
    cpfCnpj: "12.abc.345/01de-35",
    estado: "pe",
    cep: "50000-000",
  })
  expect(payload).toMatchObject({
    cpfCnpj: "12ABC34501DE35",
    estado: "PE",
    cep: "50000000",
  })
})

it.each(["529A98224725", "529.982247-25", "11111111111", "12ABC34501DE00"])(
  "rejeita documento inválido antes da rede: %s",
  async (cpfCnpj) => {
    const requisitar = vi.fn()
    await expect(
      salvarCliente(requisitar, 10, {
        ...camposCliente(),
        nomeRazaoSocial: "Nome",
        cpfCnpj,
      }),
    ).rejects.toThrow()
    expect(requisitar).not.toHaveBeenCalled()
  },
)

it("PATCH altera somente o nome e preserva documento legado inválido e demais dados omitidos", async () => {
  const legado = { ...cliente, cpf_cnpj: "LEGADO INVALIDO", tipoPessoa: null }
  const requisitar = vi
    .fn()
    .mockResolvedValue(
      ok({ cliente: { ...legado, nome_razao_social: "Novo nome" } }),
    )
  await salvarCliente(
    requisitar,
    10,
    { ...camposCliente(legado), nomeRazaoSocial: "Novo nome" },
    legado,
  )
  const [url, init] = requisitar.mock.calls[0]
  const body = JSON.parse(init.body)
  expect(url).toBe("/api/clientes/3")
  expect(init.method).toBe("PATCH")
  expect(body).toEqual({ nomeRazaoSocial: "Novo nome" })
  expect(editarSchema.safeParse(body).success).toBe(true)
})

it("limpar contato/documento manda null; edição sem alterações não faz requisição", async () => {
  expect(
    prepararCliente(
      { ...camposCliente(cliente), email: "", cpfCnpj: "" },
      cliente,
    ),
  ).toEqual({ email: null, cpfCnpj: null })
  const requisitar = vi.fn()
  await expect(
    salvarCliente(requisitar, 10, camposCliente(cliente), cliente),
  ).rejects.toThrow("Informe os dados")
  expect(requisitar).not.toHaveBeenCalled()
})

it("inativa via DELETE e reativa via PATCH, sem permitir trocar de empresa no corpo", async () => {
  const requisitar = vi.fn().mockImplementation(async () => ok({ cliente }))
  await alterarStatusCliente(requisitar, 10, cliente)
  await alterarStatusCliente(requisitar, 10, { ...cliente, status: "INATIVO" })
  expect(requisitar.mock.calls[0][1].method).toBe("DELETE")
  expect(requisitar.mock.calls[0][1].body).toBeUndefined()
  expect(requisitar.mock.calls[1][1].method).toBe("PATCH")
  expect(JSON.parse(requisitar.mock.calls[1][1].body)).toEqual({
    status: "ATIVO",
  })
  await expect(alterarStatusCliente(requisitar, 20, cliente)).rejects.toThrow(
    "incompatível",
  )
  expect(requisitar).toHaveBeenCalledTimes(2)
})

it("rejeita registros de outra empresa na listagem ou na consulta individual", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValue(
      ok({ clientes: [{ ...cliente, id_empresa: 20 }], paginacao }),
    )
  await expect(
    listarClientes(requisitar, 10, filtrosIniciais, 2),
  ).rejects.toThrow("incompatível")
  requisitar.mockResolvedValue(ok({ cliente: { ...cliente, id: 4 } }))
  await expect(consultarCliente(requisitar, 10, 3)).rejects.toThrow(
    "incompatível",
  )
})

it.each([403, 409, 500])(
  "mantém o erro HTTP %s para exibir na tela",
  async (status) => {
    const requisitar = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Mensagem da API." }, { status }),
      )
    await expect(
      listarClientes(requisitar, 10, filtrosIniciais, 1),
    ).rejects.toThrow("Mensagem da API.")
  },
)

it("resposta malformada não vira erro de campo do formulário nem sucesso", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValue(ok({ success: true, data: cliente }))
  await expect(
    salvarCliente(requisitar, 10, {
      ...camposCliente(),
      nomeRazaoSocial: "Nome",
    }),
  ).rejects.toThrow("Resposta de clientes inválida")
})

it("consulta histórico paginado e preserva os valores monetários em string", async () => {
  const pedido = {
    id: 5,
    numero: "VEN-5",
    status: "CONFIRMADA",
    data_venda: cliente.data_cadastro,
    data_entrega: null,
    valor_total: "1250.00",
  }
  const requisitar = vi
    .fn()
    .mockResolvedValue(ok({ idCliente: 3, pedidos: [pedido], paginacao }))
  const result = await historicoCliente(requisitar, 10, 3, 2)
  expect(requisitar.mock.calls[0][0]).toBe(
    "/api/clientes/3/pedidos?pagina=2&limite=10",
  )
  expect(result.pedidos[0].valor_total).toBe("1250.00")
})
