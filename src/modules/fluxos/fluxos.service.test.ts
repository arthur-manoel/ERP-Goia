import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("../producao/producao.repository", () => {
  class ProducaoError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message)
    }
  }
  return { ProducaoError, transacao: (fn: (tx: object) => unknown) => fn({}) }
})
const repo = vi.hoisted(() => ({
  buscar: vi.fn(),
  gravar: vi.fn(),
  tipoAtivo: vi.fn(),
  setorEmFluxoAtivo: vi.fn(),
  auditarCadastro: vi.fn(),
  substituirSetores: vi.fn(),
}))
vi.mock("./fluxos.repository", () => repo)

import { salvar } from "./fluxos.service"

const ctx = { idUsuario: 1, idEmpresa: 1 }
const setor = (status: "ATIVO" | "INATIVO", tipo = "Produção") => ({
  id: 5,
  nome: "Corte",
  tipo,
  descricao: null,
  status,
  createdAt: "",
  updatedAt: "",
})

beforeEach(() => {
  vi.resetAllMocks()
  repo.buscar.mockResolvedValue(setor("ATIVO"))
  repo.gravar.mockResolvedValue(5)
  repo.setorEmFluxoAtivo.mockResolvedValue(false)
  repo.tipoAtivo.mockImplementation(async (_t, _c, nome: string) => nome)
})

describe("alteração de tipo do setor", () => {
  it("nega quando o contexto não é administrador (mesmo com nome administrativo)", async () => {
    await expect(
      salvar(ctx, "setor", { tipo: "Administrativo" }, 5, { ehAdmin: false }),
    ).rejects.toMatchObject({ status: 403 })
    expect(repo.gravar).not.toHaveBeenCalled()
  })
  it("permite para administrador, validando contra tipos_setor", async () => {
    await salvar(ctx, "setor", { tipo: "Vendas" }, 5, { ehAdmin: true })
    expect(repo.tipoAtivo).toHaveBeenCalled()
    expect(repo.gravar.mock.calls[0][3]).toMatchObject({ tipo: "Vendas" })
  })
  it("rejeita tipo inexistente com 422", async () => {
    repo.tipoAtivo.mockResolvedValue(null)
    await expect(
      salvar(ctx, "setor", { tipo: "Nada" }, 5, { ehAdmin: true }),
    ).rejects.toMatchObject({ status: 422 })
  })
  it("tipo igual ao atual não exige administrador", async () => {
    await salvar(ctx, "setor", { tipo: "Produção", nome: "Novo" }, 5, {})
    expect(repo.gravar).toHaveBeenCalled()
  })
})

describe("inativação exige exclusão só na transição ATIVO -> INATIVO", () => {
  it("editar só o nome não exige permissão de exclusão", async () => {
    await salvar(ctx, "setor", { nome: "Novo" }, 5, { podeInativar: false })
    expect(repo.gravar).toHaveBeenCalled()
  })
  it("ativo -> inativo sem permissão de exclusão retorna 403", async () => {
    await expect(
      salvar(ctx, "setor", { ativo: false }, 5, { podeInativar: false }),
    ).rejects.toMatchObject({ status: 403 })
    expect(repo.gravar).not.toHaveBeenCalled()
  })
  it("ativo -> inativo com permissão de exclusão salva", async () => {
    await salvar(ctx, "setor", { ativo: false }, 5, { podeInativar: true })
    expect(repo.gravar).toHaveBeenCalled()
  })
  it("já inativo reenviando ativo:false não é transição", async () => {
    repo.buscar.mockResolvedValue(setor("INATIVO"))
    await salvar(ctx, "setor", { nome: "X", ativo: false }, 5, {
      podeInativar: false,
    })
    expect(repo.gravar).toHaveBeenCalled()
  })
  it("setor em fluxo ativo não pode ser inativado (409)", async () => {
    repo.setorEmFluxoAtivo.mockResolvedValue(true)
    await expect(
      salvar(ctx, "setor", { ativo: false }, 5, { podeInativar: true }),
    ).rejects.toMatchObject({ status: 409 })
  })
})
