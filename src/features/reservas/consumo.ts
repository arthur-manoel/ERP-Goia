type ReservaConsumo = {
  id: number
  id_necessidade_producao: number | null
  id_produto: number
  status: string
  quantidade_consumida: string
  protocolo_integrado: boolean
}
type NecessidadeConsumo = {
  id: number
  id_produto: number
  consumo_confirmado_em: string | null
}
/** Reserva atendida continua sendo referência para encerrar um material já consumido. */
export function reservasParaConsumo<T extends ReservaConsumo>(
  reservas: T[],
  necessidades: NecessidadeConsumo[],
): T[] {
  return reservas.filter((reserva) => {
    const necessidade = necessidades.find(
      (n) =>
        n.id === reserva.id_necessidade_producao &&
        n.id_produto === reserva.id_produto,
    )
    return (
      reserva.protocolo_integrado &&
      necessidade &&
      !necessidade.consumo_confirmado_em &&
      (reserva.status === "ATIVA" ||
        (reserva.status === "ATENDIDA" &&
          Number(reserva.quantidade_consumida) > 0))
    )
  })
}
