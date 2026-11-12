import { expect, it } from "vitest"
import {
  montarCadastroOp,
  type OrdemParaEdicao,
} from "../../../src/features/producao/cadastro-op"
import {
  alterarSchema,
  abrirSchema,
} from "../../../src/modules/producao/producao.schema"

const ordem: OrdemParaEdicao = {
  id: 1,
  status: "PLANEJADA",
  observacao: "Lote original",
  data_previsao: "2026-11-20T18:30:00.000Z",
  prioridade: "NORMAL",
  ordem_producao_item: [{ quantidade: "2.000", tamanho: "UNICO" }],
}
function formulario(campos: Record<string, string> = {}) {
  const dados = new FormData()
  for (const [nome, valor] of Object.entries({
    quantidade: "2",
    tamanho: "UNICO",
    prioridade: "NORMAL",
    observacao: "Lote original",
    previsao: "2026-11-20",
    ...campos,
  }))
    dados.set(nome, valor)
  return dados
}

it("editar apenas observação não recalcula insumos nem trunca o horário da previsão", () => {
  const body = montarCadastroOp(
    formulario({ observacao: "Nova observação" }),
    ordem,
  )
  expect(body).toEqual({
    statusEsperado: "PLANEJADA",
    observacao: "Nova observação",
  })
  expect(alterarSchema.safeParse(body).success).toBe(true)
})
it("quantidade decimal equivalente e formulário intacto não provocam escrita", () => {
  expect(montarCadastroOp(formulario(), ordem)).toEqual({
    statusEsperado: "PLANEJADA",
  })
  const grande = {
    ...ordem,
    ordem_producao_item: [{ quantidade: "999999999999.999", tamanho: "UNICO" }],
  }
  expect(
    montarCadastroOp(formulario({ quantidade: "999999999999.998" }), grande),
  ).toEqual({ statusEsperado: "PLANEJADA", quantidade: "999999999999.998" })
})
it("envia somente a quantidade alterada e aceita a remoção explícita da previsão", () => {
  expect(
    montarCadastroOp(
      formulario({ quantidade: "3", previsao: "", observacao: "" }),
      ordem,
    ),
  ).toEqual({
    statusEsperado: "PLANEJADA",
    quantidade: "3",
    dataPrevisao: null,
    observacao: null,
  })
})
it("não envia campos estruturais fora do planejamento ou em ordem com vários itens", () => {
  expect(
    montarCadastroOp(
      formulario({
        quantidade: "9",
        prioridade: "ALTA",
        observacao: "Prazo revisto",
      }),
      { ...ordem, status: "EM_PRODUCAO" },
    ),
  ).toEqual({ statusEsperado: "EM_PRODUCAO", observacao: "Prazo revisto" })
  expect(
    montarCadastroOp(formulario({ quantidade: "9" }), {
      ...ordem,
      ordem_producao_item: [
        ...ordem.ordem_producao_item,
        ...ordem.ordem_producao_item,
      ],
    }),
  ).toEqual({ statusEsperado: "PLANEJADA" })
})
it("abertura mantém o contrato da API com número e responsável definidos no servidor", () => {
  const body = montarCadastroOp(
    formulario({ produto: "7", observacao: "" }),
    null,
  )
  expect(body).toEqual({
    idProduto: 7,
    quantidade: "2",
    tamanho: "UNICO",
    prioridade: "NORMAL",
    observacao: null,
    dataPrevisao: "2026-11-20T00:00:00.000Z",
  })
  expect(abrirSchema.safeParse(body).success).toBe(true)
})
