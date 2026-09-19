import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IndicadorCardSkeleton } from "./indicador-card"
import { InsumosAbaixoDoMinimo } from "./insumos-abaixo-do-minimo"
import { OrdensProducaoAbertas } from "./ordens-producao-abertas"
import { PedidosAEntregar } from "./pedidos-a-entregar"
import { SaldoDoMes } from "./saldo-do-mes"

type IndicadoresPrincipaisProps = {
  /** Resultado de podeVerSaldoDoMes(), calculado no servidor. */
  mostrarSaldo: boolean
}

/**
 * Primeira área da Dashboard. Cada indicador carrega por conta própria
 * (Suspense): um lento ou com falha não trava nem derruba os outros.
 *
 * Grade: 1 coluna no celular, 2 no tablet e 3 no desktop. Pedidos e ordens de
 * produção (que têm gráfico) ocupam 2 colunas; insumos e saldo ocupam 1.
 * grid-flow-dense preenche buracos quando a ordem não fecha a linha.
 *
 * Para adicionar um indicador, crie o componente (com prop `className`) e inclua-o aqui.
 */
export function IndicadoresPrincipais({
  mostrarSaldo,
}: IndicadoresPrincipaisProps) {
  const larguraPedidos = "md:col-span-2"
  // Sem o saldo ao lado, as ordens de produção ocupam a linha inteira (sem buraco).
  const larguraOrdens = cn("md:col-span-2", !mostrarSaldo && "xl:col-span-3")

  return (
    <section aria-labelledby="titulo-indicadores-principais">
      <h2 id="titulo-indicadores-principais" className="sr-only">
        Indicadores principais
      </h2>
      <div className="grid grid-flow-dense gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<IndicadorCardSkeleton className={larguraPedidos} />}>
          <PedidosAEntregar className={larguraPedidos} />
        </Suspense>
        <Suspense fallback={<IndicadorCardSkeleton />}>
          <InsumosAbaixoDoMinimo />
        </Suspense>
        <Suspense fallback={<IndicadorCardSkeleton className={larguraOrdens} />}>
          <OrdensProducaoAbertas className={larguraOrdens} />
        </Suspense>
        {mostrarSaldo && (
          <Suspense fallback={<IndicadorCardSkeleton />}>
            <SaldoDoMes />
          </Suspense>
        )}
      </div>
    </section>
  )
}
