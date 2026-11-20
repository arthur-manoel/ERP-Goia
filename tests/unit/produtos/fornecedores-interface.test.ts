import { describe, expect, it, vi } from "vitest"
import {
  alteracoesFornecedor,
  condicoesProdutoFornecedorSchema,
  formularioFornecedor,
  produtoFornecedorSchema,
} from "@/features/produtos/fornecedores-schema"
import {
  listarFornecedoresProduto,
  opcaoFornecedorProdutoSchema,
  schemaFornecedoresDaEmpresa,
} from "@/features/produtos/fornecedores-api"

vi.mock("@/features/autenticacao/provedor-autenticacao", () => ({
  mensagemErro: async (resposta: Response) => (await resposta.json()).error,
}))

const vazio = formularioFornecedor()
const vinculo = produtoFornecedorSchema.parse({
  id: 1,
  id_empresa: 10,
  id_produto: 20,
  id_fornecedor: 30,
  codigo_produto_fornecedor: "CAM-1",
  preco_ultima_compra: "12.50",
  prazo_entrega_dias: 0,
  quantidade_minima: "2.000",
  fornecedor_principal: true,
  status: "ATIVO",
  fornecedores: { razao_social: "Fornecedor", nome_fantasia: null },
})

describe("condições do fornecedor no produto", () => {
  it("diferencia ausência e zero e normaliza decimal sem ponto flutuante", () => {
    expect(condicoesProdutoFornecedorSchema.parse(vazio)).toEqual({
      codigo_produto_fornecedor: null,
      preco_ultima_compra: null,
      prazo_entrega_dias: null,
      quantidade_minima: null,
      fornecedor_principal: false,
    })
    expect(
      condicoesProdutoFornecedorSchema.parse({
        ...vazio,
        preco_ultima_compra: "0",
        prazo_entrega_dias: "0",
        quantidade_minima: "0002,1",
      }),
    ).toMatchObject({
      preco_ultima_compra: "0.00",
      prazo_entrega_dias: 0,
      quantidade_minima: "2.100",
    })
    expect(
      condicoesProdutoFornecedorSchema.parse({
        ...vazio,
        preco_ultima_compra: "9999999999999,99",
        quantidade_minima: "999999999999.999",
      }),
    ).toMatchObject({
      preco_ultima_compra: "9999999999999.99",
      quantidade_minima: "999999999999.999",
    })
  })
  it.each([
    "-1",
    "1.001",
    "1,001",
    "1.000,00",
    "1e3",
    "Infinity",
    "NaN",
    "10000000000000",
    "1,",
    ".50",
  ])("recusa preço inválido %s", (valor) => {
    expect(
      condicoesProdutoFornecedorSchema.safeParse({
        ...vazio,
        preco_ultima_compra: valor,
      }).success,
    ).toBe(false)
  })
  it.each(["-1", "0.0001", "1000000000000", "1e3", "1.000,000"])(
    "recusa quantidade inválida %s",
    (valor) => {
      expect(
        condicoesProdutoFornecedorSchema.safeParse({
          ...vazio,
          quantidade_minima: valor,
        }).success,
      ).toBe(false)
    },
  )
  it.each(["-1", "1.5", "1,5", "2147483648", "1e2", "abc"])(
    "recusa prazo inválido %s",
    (valor) => {
      expect(
        condicoesProdutoFornecedorSchema.safeParse({
          ...vazio,
          prazo_entrega_dias: valor,
        }).success,
      ).toBe(false)
    },
  )
  it("valida limites do código e prazo", () => {
    expect(
      condicoesProdutoFornecedorSchema.safeParse({
        ...vazio,
        codigo_produto_fornecedor: "a".repeat(101),
      }).success,
    ).toBe(false)
    expect(
      condicoesProdutoFornecedorSchema.parse({
        ...vazio,
        codigo_produto_fornecedor: " CAM-1 ",
        prazo_entrega_dias: "2147483647",
      }),
    ).toMatchObject({
      codigo_produto_fornecedor: "CAM-1",
      prazo_entrega_dias: 2147483647,
    })
  })
  it("PATCH preserva condições não alteradas e permite limpeza explícita", () => {
    const form = formularioFornecedor(vinculo)
    expect(
      alteracoesFornecedor(
        vinculo,
        condicoesProdutoFornecedorSchema.parse(form),
      ),
    ).toEqual({})
    expect(
      alteracoesFornecedor(
        vinculo,
        condicoesProdutoFornecedorSchema.parse({
          ...form,
          codigo_produto_fornecedor: "",
        }),
      ),
    ).toEqual({ codigo_produto_fornecedor: null })
    expect(
      alteracoesFornecedor(
        vinculo,
        condicoesProdutoFornecedorSchema.parse({
          ...form,
          preco_ultima_compra: "12,5",
        }),
      ),
    ).toEqual({})
  })
  it("rejeita vínculo fora da empresa ou do produto", () => {
    expect(schemaFornecedoresDaEmpresa(10, 20).safeParse(vinculo).success).toBe(
      true,
    )
    expect(schemaFornecedoresDaEmpresa(11, 20).safeParse(vinculo).success).toBe(
      false,
    )
    expect(schemaFornecedoresDaEmpresa(10, 21).safeParse(vinculo).success).toBe(
      false,
    )
  })
})

describe("consulta das futuras APIs de produto-fornecedor", () => {
  const rota = "/api/produtos/20/fornecedores/opcoes"
  const pagina = (id: number, totalPages = 2) =>
    new Response(
      JSON.stringify({
        success: true,
        data: { rows: [{ id, nome: `Fornecedor ${id}` }], totalPages },
      }),
    )
  it("carrega todas as páginas com empresa fixa e sinal de cancelamento", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(pagina(1))
      .mockResolvedValueOnce(pagina(2))
    const signal = new AbortController().signal
    expect(
      await listarFornecedoresProduto(
        request,
        rota,
        10,
        opcaoFornecedorProdutoSchema,
        signal,
      ),
    ).toHaveLength(2)
    expect(request).toHaveBeenNthCalledWith(2, `${rota}?page=2&limit=100`, {
      signal,
      headers: { "X-Empresa-Id": "10" },
    })
  })
  it.each([403, 409, 429, 500])(
    "expõe falha HTTP %s sem retornar lista parcial",
    async (status) => {
      const request = vi
        .fn()
        .mockResolvedValueOnce(pagina(1))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "Falha de teste" }), { status }),
        )
      await expect(
        listarFornecedoresProduto(
          request,
          rota,
          10,
          opcaoFornecedorProdutoSchema,
          new AbortController().signal,
        ),
      ).rejects.toThrow("Falha de teste")
    },
  )
  it("indica indisponibilidade quando a API ainda não foi implementada", async () => {
    const request = vi.fn().mockResolvedValue(new Response("", { status: 404 }))
    await expect(
      listarFornecedoresProduto(
        request,
        rota,
        10,
        opcaoFornecedorProdutoSchema,
        new AbortController().signal,
      ),
    ).rejects.toThrow("indisponível")
  })
  it.each([
    { success: true, data: { rows: [{}], totalPages: 1 } },
    { success: true, data: { rows: [], totalPages: -1 } },
    { success: false },
    { success: true, data: { rows: [], totalPages: 10001 } },
  ])("rejeita contrato inválido %#", async (corpo) => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(corpo)))
    await expect(
      listarFornecedoresProduto(
        request,
        rota,
        10,
        opcaoFornecedorProdutoSchema,
        new AbortController().signal,
      ),
    ).rejects.toThrow("inválida")
  })
  it("propaga cancelamento sem repetir a consulta", async () => {
    const request = vi
      .fn()
      .mockRejectedValue(new DOMException("Cancelado", "AbortError"))
    await expect(
      listarFornecedoresProduto(
        request,
        rota,
        10,
        opcaoFornecedorProdutoSchema,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(request).toHaveBeenCalledTimes(1)
  })
})
