import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import {
  auditar as auditarCliente,
  type Cliente,
  type Transaction,
} from "../../../src/modules/clientes/clientes.repository"
import { auditarCadastro } from "../../../src/modules/fluxos/fluxos.repository"
import {
  auditar as auditarProducao,
  type Ordem,
} from "../../../src/modules/producao/producao.repository"

const tx = db as unknown as Transaction
const ctx = { idEmpresa: 10, idUsuario: 1, podeExcluir: true }
const cliente = (observacao: string) => ({ id: 1, observacao }) as Cliente

it("preserva JSON de cliente no limite exato do TEXT, incluindo a atualização", () => {
  const overhead = Buffer.byteLength(JSON.stringify(cliente("")), "utf8")
  const antes = cliente("a".repeat(65_535 - overhead))
  const depois = cliente('São João 👩🏽‍💻 e\u0301 "texto" \\ caminho')
  auditarCliente(tx, ctx, antes, depois)
  const { data } = db.auditoria.create.mock.calls[0][0]
  expect(Buffer.byteLength(data.dados_anteriores, "utf8")).toBe(65_535)
  expect(data.dados_anteriores).toBe(JSON.stringify(antes))
  expect(data.dados_novos).toBe(JSON.stringify(depois))
  expect(JSON.parse(data.dados_novos)).toEqual(depois)
})

it.each(["antes", "depois"])(
  "rejeita snapshot de cliente acima do limite em %s antes de gravar a auditoria",
  (lado) => {
    const overhead = Buffer.byteLength(JSON.stringify(cliente("")), "utf8")
    const longo = cliente("a".repeat(65_536 - overhead))
    expect(() =>
      auditarCliente(
        tx,
        ctx,
        lado === "antes" ? longo : null,
        lado === "depois" ? longo : cliente("válido"),
      ),
    ).toThrow(/65\.535 bytes/)
    expect(db.auditoria.create).not.toHaveBeenCalled()
  },
)

it("mede os escapes finais do JSON de cliente, não só o texto original", () => {
  const registro = cliente("\u0000".repeat(11_000))
  expect(Buffer.byteLength(registro.observacao!, "utf8")).toBe(11_000)
  expect(() => auditarCliente(tx, ctx, null, registro)).toThrow(/65\.535 bytes/)
  expect(db.auditoria.create).not.toHaveBeenCalled()
})

it("preserva snapshots de fluxo e os nulls usados na criação/exclusão", () => {
  const registro = { nome: "Fluxo 🎨", descricao: 'e\u0301 "corte"' }
  auditarCadastro(tx, ctx, "fluxos_producao", 2, null, registro)
  auditarCadastro(tx, ctx, "fluxos_producao", 2, registro, null)
  const [criacao, exclusao] = db.auditoria.create.mock.calls.map(
    ([query]) => query.data,
  )
  expect(criacao).toMatchObject({
    acao: "INSERT",
    dados_anteriores: null,
    dados_novos: JSON.stringify(registro),
  })
  expect(exclusao).toMatchObject({
    acao: "DELETE",
    dados_anteriores: JSON.stringify(registro),
    dados_novos: null,
  })
})

it.each(["antes", "depois"])(
  "rejeita fluxo de 100 setores com JSON UTF-8 excedente em %s",
  (lado) => {
    const registro = {
      nome: "Fluxo",
      setores: Array.from({ length: 100 }, (_, id) => ({
        id,
        nome: "a".repeat(100),
        descricao: "界".repeat(255),
      })),
    }
    expect(() =>
      auditarCadastro(
        tx,
        ctx,
        "fluxos_producao",
        2,
        lado === "antes" ? registro : null,
        lado === "depois" ? registro : null,
      ),
    ).toThrow(/65\.535 bytes/)
    expect(db.auditoria.create).not.toHaveBeenCalled()
  },
)

it("valida o wrapper final da auditoria de produção e preserva seus metadados", async () => {
  const registro = { id: 3, observacao: "Produção 💡" } as Ordem
  await auditarProducao(tx, ctx, null, registro)
  const { data } = db.auditoria.create.mock.calls[0][0]
  expect(data.dados_anteriores).toBeNull()
  expect(data.dados_novos).toBe(
    JSON.stringify({
      ...registro,
      perdaAplicada: false,
      baixaEstoque: "pendente",
    }),
  )
})

it("rejeita produção cujo wrapper excede TEXT mesmo com registro bruto válido", async () => {
  const overhead = Buffer.byteLength(JSON.stringify(cliente("")), "utf8")
  const registro = cliente("a".repeat(65_535 - overhead)) as unknown as Ordem
  await expect(auditarProducao(tx, ctx, null, registro)).rejects.toMatchObject({
    status: 400,
    message: expect.stringMatching(/65\.535 bytes/),
  })
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
