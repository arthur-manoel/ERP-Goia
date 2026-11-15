import type {
  ResultadoIndicador,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "@/lib/dashboard/tipos"

export type DadosIndicadores = {
  ordens: OrdensProducaoAbertas
  pedidos: PedidosAEntregar
  saldo: SaldoDoMes
}
export type ResultadosIndicadores = {
  [K in keyof DadosIndicadores]?: ResultadoIndicador<DadosIndicadores[K]>
}
export type RequisitarIndicador = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

/** Uma carga por empresa; o cancelamento impede respostas tardias após a troca. */
export function carregarIndicadores(
  requisitar: RequisitarIndicador,
  receber: (resultado: ResultadosIndicadores) => void,
) {
  const controller = new AbortController()
  for (const indicador of ["ordens", "pedidos", "saldo"] as const) {
    void requisitar(`/api/dashboard/${indicador}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) return { estado: "sem_permissao" } as const
        if (!response.ok) throw new Error("Falha ao consultar indicador.")
        return (await response.json()).data as ResultadoIndicador<
          DadosIndicadores[typeof indicador]
        >
      })
      .catch(() => ({ estado: "erro" }) as const)
      .then((dados) => {
        if (!controller.signal.aborted) receber({ [indicador]: dados })
      })
  }
  return () => controller.abort()
}
