import { expect, it } from "vitest"
import { validarResultadoAuditoria } from "../../../src/features/auditoria/api"

const evento = {
  id: 1,
  id_empresa: 10,
  id_usuario: null,
  data_evento: "2026-11-11T15:30:00.000Z",
  usuario: "Sistema",
  tabela: "cores",
  id_registro: 7,
  acao: "UPDATE",
  antes: { nome: "Azul" },
  depois: { nome: "Marinho" },
}
const resultado = {
  itens: [evento],
  total: 1,
  pagina: 1,
  totalPaginas: 1,
  proximoCursor: null,
}

it.each([
  {},
  null,
  { ...resultado, itens: null },
  { ...resultado, itens: [{}] },
  { ...resultado, itens: [{ ...evento, data_evento: "data inválida" }] },
])(
  "rejeita resposta malformada antes de renderizar tabela e datas: %j",
  (body) => {
    expect(() => validarResultadoAuditoria(body, 10, 1)).toThrow(
      /Resposta de auditoria inválida/,
    )
  },
)
it("recusa eventos de outra empresa e página divergente", () => {
  expect(() => validarResultadoAuditoria(resultado, 20, 1)).toThrow(
    /incompatível/,
  )
  expect(() => validarResultadoAuditoria(resultado, 10, 2)).toThrow(
    /incompatível/,
  )
})
it("aceita snapshots nulos, eventos legados de texto e lista vazia", () => {
  expect(
    validarResultadoAuditoria(
      {
        ...resultado,
        itens: [
          { ...evento, antes: null, depois: "Conteúdo legado indisponível" },
        ],
      },
      10,
      1,
    ).itens[0].antes,
  ).toBeNull()
  expect(
    validarResultadoAuditoria(
      { itens: [], total: 0, pagina: 1, totalPaginas: 0, proximoCursor: null },
      10,
      1,
    ).itens,
  ).toEqual([])
})
it.each(["INSERT", "UPDATE", "DELETE", "LOGIN", "LOGOUT"])(
  "exibe todas as ações existentes no banco: %s",
  (acao) => {
    expect(
      validarResultadoAuditoria(
        { ...resultado, itens: [{ ...evento, acao }] },
        10,
        1,
      ).itens[0].acao,
    ).toBe(acao)
  },
)
