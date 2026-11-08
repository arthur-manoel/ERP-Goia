import { expect, it } from "vitest"
import { reservasParaConsumo } from "../../../src/features/reservas/consumo"
import { consumoSchema } from "../../../src/modules/reservas/reservas.schema"
const necessidade = { id: 5, id_produto: 7, consumo_confirmado_em: null }
const reserva = {
  id: 4,
  id_necessidade_producao: 5,
  id_produto: 7,
  status: "ATIVA",
  quantidade_consumida: "0.000",
  protocolo_integrado: true,
}
it("D1: reserva integralmente atendida permanece disponível para encerrar o material pendente", () => {
  const atendida = {
    ...reserva,
    status: "ATENDIDA",
    quantidade_consumida: "2.000",
  }
  expect(reservasParaConsumo([reserva, atendida], [necessidade])).toEqual([
    reserva,
    atendida,
  ])
  expect(
    reservasParaConsumo(
      [atendida],
      [{ ...necessidade, consumo_confirmado_em: "2026-11-01T15:00:00Z" }],
    ),
  ).toEqual([])
})
it("não oferece reserva legada, de outro material/necessidade ou cancelada", () => {
  const casos = [
    { ...reserva, protocolo_integrado: false },
    { ...reserva, id_produto: 8 },
    { ...reserva, id_necessidade_producao: 9 },
    { ...reserva, status: "CANCELADA" },
  ]
  expect(reservasParaConsumo(casos, [necessidade])).toEqual([])
})
it("zero precisa ser explícito, com encerramento e motivo", () => {
  const v = {
    idReserva: 4,
    quantidade: "0",
    concluirConsumo: true,
    motivoDivergencia: "Confirmar consumo já realizado",
  }
  expect(consumoSchema.safeParse(v).success).toBe(true)
  for (const dados of [
    { ...v, quantidade: "" },
    { ...v, concluirConsumo: false },
    { ...v, motivoDivergencia: undefined },
  ])
    expect(consumoSchema.safeParse(dados).success).toBe(false)
})
