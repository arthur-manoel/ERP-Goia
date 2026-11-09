import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/autenticacao/provedor-autenticacao", () => ({
  mensagemErro: async () => "erro",
}))
import { editarSetor } from "./api"

const atual = {
  id: 5,
  nome: "Corte",
  tipo: "Produção",
  descricao: null,
  ativo: false,
  createdAt: "",
  updatedAt: "",
}
const resposta = (setor = atual) =>
  new Response(JSON.stringify({ setor }), { status: 200 })

describe("editarSetor", () => {
  it("setor inativo, só o nome: envia apenas nome (sem ativo)", async () => {
    const req = vi.fn().mockResolvedValue(resposta())
    await editarSetor(req, atual, {
      nome: "Corte 2",
      tipo: "",
      descricao: "",
      ativo: false,
    })
    expect(JSON.parse(req.mock.calls[0][1].body)).toEqual({ nome: "Corte 2" })
  })
  it("tipo só vai quando muda", async () => {
    const req = vi.fn().mockResolvedValue(resposta())
    await editarSetor(req, atual, {
      nome: "Corte",
      tipo: "Produção",
      descricao: "d",
      ativo: false,
    })
    expect(JSON.parse(req.mock.calls[0][1].body)).toEqual({ descricao: "d" })
  })
  it("sem alterações não faz requisição", async () => {
    const req = vi.fn()
    const salvo = await editarSetor(req, atual, {
      nome: "Corte",
      tipo: "",
      descricao: "",
      ativo: false,
    })
    expect(req).not.toHaveBeenCalled()
    expect(salvo).toBe(atual)
  })
})
