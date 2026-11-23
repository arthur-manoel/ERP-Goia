import { describe, expect, it } from "vitest"
import {
  criarFornecedorSchema,
  editarFornecedorSchema,
  gerarGradeSchema,
  paginaSchema,
} from "../../../modules/produtos/configuracao/schema"

describe("contratos de configuração do produto", () => {
  it("interpreta dimensões omitidas como null e exige uma dimensão por combinação", () => {
    expect(
      gerarGradeSchema.parse({ variacoes: [{ id_cor: 2 }, { id_tamanho: 4 }] }),
    ).toEqual({
      variacoes: [
        { id_cor: 2, id_tamanho: null },
        { id_cor: null, id_tamanho: 4 },
      ],
    })
    for (const item of [
      {},
      { id_cor: 0 },
      { id_cor: "2" },
      { id_tamanho: 2147483648 },
    ])
      expect(gerarGradeSchema.safeParse({ variacoes: [item] }).success).toBe(
        false,
      )
  })

  it("valida paginação no limite consumido pelo diálogo", () => {
    expect(paginaSchema.parse({ limit: "100", page: "1" })).toEqual({
      limit: 100,
      page: 1,
    })
    for (const query of [
      { limit: "101" },
      { page: "10001" },
      { page: "0" },
      { id_empresa: "2" },
    ])
      expect(paginaSchema.safeParse(query).success).toBe(false)
  })

  it("preserva ausência, zero, null e a representação decimal", () => {
    expect(criarFornecedorSchema.parse({ id_fornecedor: 3 })).toEqual({
      id_fornecedor: 3,
    })
    expect(
      editarFornecedorSchema.parse({
        codigo_produto_fornecedor: " 0001 ",
        preco_ultima_compra: "0.00",
        prazo_entrega_dias: 0,
        quantidade_minima: null,
      }),
    ).toEqual({
      codigo_produto_fornecedor: "0001",
      preco_ultima_compra: "0.00",
      prazo_entrega_dias: 0,
      quantidade_minima: null,
    })
    for (const body of [
      {},
      { id_fornecedor: 3 },
      { preco_ultima_compra: "0.001" },
      { quantidade_minima: 0 },
      { prazo_entrega_dias: 0.1 },
      { fornecedor_principal: true, status: "INATIVO" },
    ])
      expect(editarFornecedorSchema.safeParse(body).success).toBe(false)
  })
})
