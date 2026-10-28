import { beforeEach, describe, expect, it } from "vitest"
import {
  createContaPagarSchema,
  updateContaPagarSchema,
  patchContaPagarSchema,
} from "../../../modules/contas_pagar/schema"
import {
  createContaReceberSchema,
  updateContaReceberSchema,
  patchContaReceberSchema,
} from "../../../modules/contas_receber/schema"
import {
  createDespesaSchema,
  updateDespesaSchema,
  patchDespesaSchema,
} from "../../../modules/despesas/schema"
import * as pagar from "../../../src/app/api/contas_pagar/route"
import * as pagarItem from "../../../src/app/api/contas_pagar/[id]/route"
import * as receber from "../../../src/app/api/contas_receber/route"
import * as receberItem from "../../../src/app/api/contas_receber/[id]/route"
import * as despesas from "../../../src/app/api/despesas/route"
import * as despesaItem from "../../../src/app/api/despesas/[id]/route"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { input as pagarInput } from "../contas_pagar/fixtures"
import { input as receberInput } from "../contas_receber/fixtures"

const despesaInput = {
  id_empresa: 10,
  id_categoria: 30,
  descricao: "Energia",
  data_despesa: "2026-10-24",
  valor: "100.00",
}
const modulos = [
  {
    nome: "contas_pagar",
    input: pagarInput,
    schemas: [
      createContaPagarSchema,
      updateContaPagarSchema,
      patchContaPagarSchema,
    ],
    collection: pagar,
    item: pagarItem,
  },
  {
    nome: "contas_receber",
    input: receberInput,
    schemas: [
      createContaReceberSchema,
      updateContaReceberSchema,
      patchContaReceberSchema,
    ],
    collection: receber,
    item: receberItem,
  },
  {
    nome: "despesas",
    input: despesaInput,
    schemas: [createDespesaSchema, updateDespesaSchema, patchDespesaSchema],
    collection: despesas,
    item: despesaItem,
  },
] as const

const permitidos = [
  ["ASCII abaixo", "a".repeat(65_534)],
  ["ASCII no limite", "a".repeat(65_535)],
  ["acentos abaixo", "á".repeat(32_767)],
  ["acentos no limite", "á".repeat(32_767) + "a"],
  ["compostos no limite", "a\u0301".repeat(21_845)],
  ["emojis abaixo", "😀".repeat(16_383) + "ab"],
  ["emojis no limite", "😀".repeat(16_383) + "abc"],
  ["vazio", ""],
  ["espaços", "  "],
] as const
const excedentes = [
  ["ASCII", "a".repeat(65_536)],
  ["acentos", "á".repeat(32_768)],
  ["compostos", "a\u0301".repeat(21_845) + "a"],
  ["emojis", "😀".repeat(16_384)],
] as const

beforeEach(() => resetRateLimitsForTests())

describe.each(modulos)("$nome: observação TEXT", (modulo) => {
  it.each(permitidos)("preserva %s em POST, PUT e PATCH", (_, observacao) => {
    for (const schema of modulo.schemas) {
      const parsed = schema.parse({ ...modulo.input, observacao })
      expect(parsed.observacao).toBe(observacao)
    }
  })

  it.each(excedentes)(
    "rejeita excesso de bytes em %s nos três schemas",
    (_, observacao) => {
      for (const schema of modulo.schemas) {
        const parsed = schema.safeParse({ ...modulo.input, observacao })
        expect(parsed.success).toBe(false)
        if (!parsed.success)
          expect(parsed.error.issues[0].path).toEqual(["observacao"])
      }
    },
  )

  it("preserva null e a opcionalidade existente", () => {
    for (const schema of modulo.schemas) {
      expect(
        schema.parse({ ...modulo.input, observacao: null }).observacao,
      ).toBeNull()
      expect(schema.safeParse(modulo.input).success).toBe(true)
    }
  })

  it.each(["POST", "PUT", "PATCH"] as const)(
    "%s devolve 400 com campo/limite antes de abrir a transação",
    async (metodo) => {
      // 32.768 unidades UTF-16 passam no antigo max(65.535), mas ocupam 65.536 bytes.
      const path = `/api/${modulo.nome}${metodo === "POST" ? "" : "/1"}`
      const req = await request(path, metodo, {
        ...modulo.input,
        observacao: "á".repeat(32_768),
      })
      const response =
        metodo === "POST"
          ? await modulo.collection.POST(req)
          : await modulo.item[metodo](req, context())
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body).toMatchObject({
        success: false,
        error: expect.stringContaining("observacao"),
      })
      expect(body.error).toContain("65.535 bytes em UTF-8")
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.auditoria.create).not.toHaveBeenCalled()
    },
  )
})
