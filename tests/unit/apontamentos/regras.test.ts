import { describe, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import {
  registrarSchema,
  corrigirSchema,
  estornarSchema,
  chaveSchema,
} from "../../../src/modules/apontamentos/apontamentos.schema"
import {
  validarData,
  diaOperacional,
  validarDisponibilidade,
  validarEstornoLegado,
  type Etapa,
} from "../../../src/modules/apontamentos/apontamentos.regras"

const registro = {
  idEtapa: 1,
  idItem: 2,
  quantidadeProduzida: "8",
  quantidadePerdida: "2",
  motivoPerda: "  Corte irregular  ",
  dataApontamento: "2026-10-30",
}
describe("contrato decimal e motivos", () => {
  it("normaliza exatamente; permite produção sem perda e perda total", () => {
    expect(registrarSchema.parse(registro)).toMatchObject({
      quantidadeProduzida: "8.000",
      quantidadePerdida: "2.000",
      motivoPerda: "Corte irregular",
    })
    expect(
      registrarSchema.parse({
        ...registro,
        quantidadePerdida: "0",
        motivoPerda: null,
      }),
    ).toMatchObject({ motivoPerda: null })
    expect(
      registrarSchema.parse({ ...registro, quantidadeProduzida: "0" }),
    ).toMatchObject({ quantidadeProduzida: "0.000" })
    expect(
      registrarSchema.parse({
        ...registro,
        quantidadeProduzida: "999999999999.999",
      }),
    ).toMatchObject({ quantidadeProduzida: "999999999999.999" })
    expect(
      registrarSchema.parse({ ...registro, motivoPerda: "😀".repeat(255) })
        .motivoPerda,
    ).toHaveLength(510)
  })
  it.each([
    { quantidadeProduzida: "-1" },
    { quantidadePerdida: "-1" },
    { quantidadeProduzida: "1.0001" },
    { quantidadeProduzida: "1000000000000" },
    { quantidadeProduzida: 1 },
    { quantidadeProduzida: "1e2" },
    { quantidadeProduzida: "NaN" },
    { quantidadeProduzida: "0", quantidadePerdida: "0", motivoPerda: null },
    { motivoPerda: null },
    { motivoPerda: "  " },
    { motivoPerda: "a".repeat(256) },
    { quantidadePerdida: "0", motivoPerda: "motivo" },
    { dataApontamento: "2026-02-30" },
    { dataApontamento: "2025-02-29" },
    { dataApontamento: "2026-10-30T00:00:00Z" },
    { idUsuario: 10 },
    { idEmpresa: 10 },
    { dataCadastro: "2026-10-30" },
  ])("rejeita %j sem arredondar ou aceitar autoridade do cliente", (patch) => {
    expect(registrarSchema.safeParse({ ...registro, ...patch }).success).toBe(
      false,
    )
  })
  it("correção/estorno exigem motivo e não permitem trocar item ou etapa", () => {
    const { idItem, idEtapa, ...values } = registro
    expect(idItem + idEtapa).toBe(3)
    expect(
      corrigirSchema.safeParse({ ...values, motivoCorrecao: "Conferência" })
        .success,
    ).toBe(true)
    expect(
      corrigirSchema.safeParse({ ...values, motivoCorrecao: " " }).success,
    ).toBe(false)
    expect(
      corrigirSchema.safeParse({
        ...values,
        motivoCorrecao: "Conferência",
        idItem: 3,
      }).success,
    ).toBe(false)
    expect(estornarSchema.safeParse({ motivo: " " }).success).toBe(false)
    expect(estornarSchema.safeParse({ motivo: "Duplicado" }).success).toBe(true)
  })
  it.each(["á".repeat(8), "curta", "a".repeat(37), "com espaços"])(
    "rejeita chave inválida %s",
    (key) => expect(chaveSchema.safeParse(key).success).toBe(false),
  )
})
const D = (value: string) => new Prisma.Decimal(value)
const etapas: Etapa[] = [1, 2, 3].map((n) => ({
  id: n,
  id_setor: n,
  ordem: n,
  status: "EM_PRODUCAO",
  data_inicio: new Date("2026-10-30T12:00:00Z"),
}))
it("propaga somente produção válida; não subtrai a perda duas vezes", () => {
  const result = validarDisponibilidade(etapas, D("10"), [
    { id_setor: 1, produzida: D("8"), perdida: D("2") },
    { id_setor: 2, produzida: D("7"), perdida: D("1") },
  ])
  expect(result.map((e) => e.disponivel)).toEqual(["10.000", "8.000", "7.000"])
})
it("etapa ausente e perda total nunca restauram a quantidade planejada", () => {
  const first = { id_setor: 1, produzida: D("8"), perdida: D("2") }
  expect(validarDisponibilidade(etapas, D("10"), [first])[2].disponivel).toBe(
    "0.000",
  )
  expect(() =>
    validarDisponibilidade(etapas, D("10"), [
      first,
      { id_setor: 3, produzida: D("1"), perdida: D("0") },
    ]),
  ).toThrow(/excede/)
  expect(
    validarDisponibilidade(etapas, D("10"), [
      { id_setor: 1, produzida: D("0"), perdida: D("10") },
    ])[1].disponivel,
  ).toBe("0.000")
})
it("rejeita excesso acumulado e correção que invalida etapa seguinte", () => {
  expect(() =>
    validarDisponibilidade(etapas, D("10"), [
      { id_setor: 1, produzida: D("10"), perdida: D("0.001") },
    ]),
  ).toThrow(/excede/)
  expect(() =>
    validarDisponibilidade(etapas, D("10"), [
      { id_setor: 1, produzida: D("5"), perdida: D("2") },
      { id_setor: 2, produzida: D("6"), perdida: D("0") },
    ]),
  ).toThrow(/excede/)
})
it("valida intervalo no fuso operacional independentemente do fuso do processo", () => {
  const inicio = new Date("2026-10-30T03:01:00Z"),
    agora = new Date("2026-10-31T02:59:00Z")
  expect(diaOperacional(agora)).toBe("2026-10-30")
  expect(() => validarData("2026-10-30", inicio, agora)).not.toThrow()
  for (const dia of ["2026-10-29", "2026-10-31"])
    expect(() => validarData(dia, inicio, agora)).toThrow(/Data/)
  expect(() => validarData("2026-10-30", null, agora)).toThrow(/Data/)
})
it("reconcilia legado inconsistente por estornos sem aumentar outro excesso", () => {
  const a = { id_setor: 2, produzida: D("5"), perdida: D("0") },
    b = { id_setor: 3, produzida: D("6"), perdida: D("0") }
  expect(() => validarEstornoLegado(etapas, D("10"), [a, b], [a])).not.toThrow()
  expect(() => validarEstornoLegado(etapas, D("10"), [a, b], [b])).toThrow(
    /últimas etapas/,
  )
})
