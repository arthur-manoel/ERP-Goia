import { schemasDadosIndicadores } from "@/lib/dashboard/validacao"
import type {
  ResultadoIndicador,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
  InsumosAbaixoDoMinimo,
} from "@/lib/dashboard/tipos"

export type DadosIndicadores = {
  ordens: OrdensProducaoAbertas
  pedidos: PedidosAEntregar
  saldo: SaldoDoMes
  estoque: InsumosAbaixoDoMinimo
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
  const rotas = {
    ordens: "/api/dashboard/ordens",
    pedidos: "/api/dashboard/pedidos",
    saldo: "/api/dashboard/saldo",
    estoque: "/api/estoque-minimo",
  } as const
  for (const indicador of ["ordens", "pedidos", "saldo", "estoque"] as const) {
    void requisitar(rotas[indicador], {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 403) return { estado: "sem_permissao" } as const
        if (!response.ok) throw new Error("Falha ao consultar indicador.")
        const body = await response.json()
        const resultado =
          indicador === "estoque"
            ? { estado: "ok", dados: body?.indicador }
            : body?.data
        if (
          !resultado ||
          !["ok", "erro", "sem_permissao", "nao_integrado"].includes(
            resultado.estado,
          ) ||
          (resultado.estado === "ok" &&
            (!resultado.dados || typeof resultado.dados !== "object"))
        ) {
          throw new Error("Resposta inválida do indicador.")
        }
        return resultado.estado === "ok"
          ? {
              estado: "ok" as const,
              dados: schemasDadosIndicadores[indicador].parse(resultado.dados),
            }
          : (resultado as Exclude<ResultadoIndicador<never>, { estado: "ok" }>)
      })
      .catch(() => ({ estado: "erro" }) as const)
      .then((dados) => {
        if (!controller.signal.aborted) receber({ [indicador]: dados })
      })
  }
  return () => controller.abort()
}
