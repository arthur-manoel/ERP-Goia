// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { FormularioEmpresa } from "@/features/empresas/components/formulario-empresa"
import { ConteudoEmpresas as TelaEmpresas } from "@/features/empresas/components/tela-empresas"
import { apiEmpresasTeste as apiEmpresasPendente } from "./fixtures"
import {
  cadastroEmpresaSchema,
  empresaSchema,
  formularioEmpresa,
  payloadEmpresa,
} from "@/features/empresas/schemas"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function preencher(nome: string, valor: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${nome}"]`,
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, valor)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function enviar(vezes = 1) {
  await act(async () => {
    for (let i = 0; i < vezes; i++)
      document
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}
it("formulário real valida antes de enviar e normaliza campos opcionais", async () => {
  const criar = vi.fn().mockResolvedValue(undefined),
    aoFechar = vi.fn(),
    aoSalvar = vi.fn()
  await act(async () =>
    root.render(
      createElement(FormularioEmpresa, {
        empresa: null,
        api: { ...apiEmpresasPendente, criar },
        aoFechar,
        aoSalvar,
      }),
    ),
  )
  await enviar()
  expect(criar).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain("Preencha este campo")
  await preencher("razao_social", " Goia Teste ")
  await preencher("cnpj", "11.222.333/0001-81")
  await enviar()
  expect(criar).toHaveBeenCalledOnce()
  expect(criar.mock.calls[0][0]).toMatchObject({
    razao_social: "Goia Teste",
    cnpj: "11222333000181",
    logo_url: null,
    cor_tema: "#22c55e",
  })
  expect(aoSalvar).toHaveBeenCalledOnce()
  expect(aoFechar).toHaveBeenCalledOnce()
})
it("403 preserva dados e deixa uma falha legível no diálogo", async () => {
  const criar = vi
      .fn()
      .mockRejectedValue(
        new Error("Operação restrita à administração global."),
      ),
    aoFechar = vi.fn()
  await act(async () =>
    root.render(
      createElement(FormularioEmpresa, {
        empresa: null,
        api: { ...apiEmpresasPendente, criar },
        aoFechar,
        aoSalvar: vi.fn(),
      }),
    ),
  )
  await preencher("razao_social", "Goia")
  await preencher("cnpj", "11222333000181")
  await enviar()
  expect(document.body.textContent).toContain(
    "Operação restrita à administração global",
  )
  expect(
    document.querySelector<HTMLInputElement>('input[name="razao_social"]')!
      .value,
  ).toBe("Goia")
  expect(aoFechar).not.toHaveBeenCalled()
})
it("trava duplo envio e mantém controles bloqueados durante a gravação", async () => {
  let resolver!: () => void
  const criar = vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolver = resolve
      }),
  )
  await act(async () =>
    root.render(
      createElement(FormularioEmpresa, {
        empresa: null,
        api: { ...apiEmpresasPendente, criar },
        aoFechar: vi.fn(),
        aoSalvar: vi.fn(),
      }),
    ),
  )
  await preencher("razao_social", "Goia")
  await preencher("cnpj", "11222333000181")
  await enviar(2)
  expect(criar).toHaveBeenCalledOnce()
  expect(document.querySelector("fieldset")!.disabled).toBe(true)
  await act(async () => resolver())
})
it("edição preserva CNPJ legado e envia somente a mudança", async () => {
  const empresa = empresaSchema.parse({
    id: 10,
    status: "ATIVA",
    ...cadastroEmpresaSchema.parse(
      payloadEmpresa({
        ...formularioEmpresa(),
        razao_social: "Goia",
        cnpj: "11222333000181",
      }),
    ),
    cnpj: "LEGADO",
  })
  const editar = vi.fn().mockResolvedValue(undefined)
  await act(async () =>
    root.render(
      createElement(FormularioEmpresa, {
        empresa,
        api: { ...apiEmpresasPendente, editar },
        aoFechar: vi.fn(),
        aoSalvar: vi.fn(),
      }),
    ),
  )
  await preencher("nome_fantasia", "Goia Camisaria")
  await enviar()
  expect(editar).toHaveBeenCalledExactlyOnceWith(10, {
    nome_fantasia: "Goia Camisaria",
  })
})

it("lista vazia e falha da consulta são estados diferentes e permitem nova tentativa", async () => {
  const listar = vi
    .fn()
    .mockRejectedValueOnce(new Error("Falha de consulta"))
    .mockResolvedValue({
      itens: [],
      pagina: 1,
      limite: 10,
      total: 0,
      totalPaginas: 1,
      meta: undefined,
    })
  await act(async () =>
    root.render(
      createElement(TelaEmpresas, { api: { ...apiEmpresasPendente, listar } }),
    ),
  )
  expect(document.body.textContent).toContain("Falha de consulta")
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find((botao) => botao.textContent === "Tentar novamente")!
      .click(),
  )
  expect(document.body.textContent).toContain("Nenhuma empresa encontrada")
  expect(listar).toHaveBeenCalledTimes(2)
})

it("não abre edição quando o serviço devolve outro ID", async () => {
  const empresa = empresaSchema.parse({
    id: 10,
    status: "ATIVA",
    ...cadastroEmpresaSchema.parse(
      payloadEmpresa({
        ...formularioEmpresa(),
        razao_social: "Goia",
        cnpj: "11222333000181",
      }),
    ),
  })
  const api = {
    ...apiEmpresasPendente,
    listar: vi.fn().mockResolvedValue({
      itens: [empresa],
      pagina: 1,
      limite: 10,
      total: 1,
      totalPaginas: 1,
      meta: undefined,
    }),
    consultar: vi.fn().mockResolvedValue({ ...empresa, id: 99 }),
  }
  await act(async () => root.render(createElement(TelaEmpresas, { api })))
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Ações de Goia"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
  )
  await act(async () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.trim() === "Editar")!
      .click(),
  )
  expect(document.body.textContent).toContain(
    "Empresa retornada fora do cadastro consultado",
  )
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it("inativa somente após confirmar e recarrega a situação recebida do serviço", async () => {
  const empresa = empresaSchema.parse({
    id: 10,
    status: "ATIVA",
    ...cadastroEmpresaSchema.parse(
      payloadEmpresa({
        ...formularioEmpresa(),
        razao_social: "Goia",
        cnpj: "11222333000181",
      }),
    ),
  })
  const inativar = vi.fn().mockImplementation(async () => {
    empresa.status = "INATIVA"
  })
  const api = {
    ...apiEmpresasPendente,
    inativar,
    listar: vi.fn().mockImplementation(async () => ({
      itens: [{ ...empresa }],
      pagina: 1,
      limite: 10,
      total: 1,
      totalPaginas: 1,
      meta: undefined,
    })),
  }
  await act(async () => root.render(createElement(TelaEmpresas, { api })))
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Ações de Goia"]')!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
  )
  await act(async () =>
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .find((item) => item.textContent?.trim() === "Inativar")!
      .click(),
  )
  expect(inativar).not.toHaveBeenCalled()
  await act(async () =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[role="alertdialog"] button',
      ),
    )
      .find((item) => item.textContent?.trim() === "Inativar")!
      .click(),
  )
  expect(inativar).toHaveBeenCalledExactlyOnceWith(10)
  expect(document.body.textContent).toContain("Inativa")
  expect(api.listar).toHaveBeenCalledTimes(2)
})

it("mantém formulário ocupado até concluir a atualização da sessão posterior à escrita", async () => {
  let concluir!: () => void
  const criar = vi.fn().mockResolvedValue(undefined),
    aoFechar = vi.fn()
  const aoSalvar = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        concluir = resolve
      }),
  )
  await act(async () =>
    root.render(
      createElement(FormularioEmpresa, {
        empresa: null,
        api: { ...apiEmpresasPendente, criar },
        aoFechar,
        aoSalvar,
      }),
    ),
  )
  await preencher("razao_social", "Goia")
  await preencher("cnpj", "11222333000181")
  await enviar()
  expect(criar).toHaveBeenCalledOnce()
  expect(aoFechar).not.toHaveBeenCalled()
  expect(document.querySelector("fieldset")!.disabled).toBe(true)
  await act(async () => concluir())
  expect(aoFechar).toHaveBeenCalledOnce()
})

it("falha na revalidação após escrita confirmada não reenvia cadastro nem mantém formulário para novo POST", async () => {
  const criar = vi.fn().mockResolvedValue(undefined)
  const api = {
    ...apiEmpresasPendente,
    criar,
    listar: vi.fn().mockResolvedValue({
      itens: [],
      pagina: 1,
      limite: 10,
      total: 0,
      totalPaginas: 1,
      meta: undefined,
    }),
  }
  const aoAtualizarSessao = vi.fn().mockRejectedValue(new Error("Sem conexão"))
  await act(async () =>
    root.render(createElement(TelaEmpresas, { api, aoAtualizarSessao })),
  )
  await act(async () =>
    Array.from(document.querySelectorAll("button"))
      .find((item) => item.textContent?.trim() === "Nova empresa")!
      .click(),
  )
  await preencher("razao_social", "Goia")
  await preencher("cnpj", "11222333000181")
  await enviar()
  expect(criar).toHaveBeenCalledOnce()
  expect(aoAtualizarSessao).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.body.textContent).toContain("Os dados foram salvos")
})
