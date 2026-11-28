"use client"

import { Suspense } from "react"
import { cn } from "@/lib/utils"
import { IndicadorCardSkeleton } from "./indicador-card"
import { InsumosAbaixoDoMinimo } from "./insumos-abaixo-do-minimo"
import { OrdensProducaoAbertas } from "./ordens-producao-abertas"
import { PedidosAEntregar } from "./pedidos-a-entregar"
import { SaldoDoMes } from "./saldo-do-mes"

import { useIndicador } from "./provedor-indicadores"

export function IndicadoresPrincipais() {
  const saldo = useIndicador("saldo")
  const mostrarSaldo = saldo?.estado !== "sem_permissao"
  const larguraPedidos = "md:col-span-2"
  // Sem o saldo ao lado, as ordens de produção ocupam a linha inteira (sem buraco).
  const larguraOrdens = cn("md:col-span-2", !mostrarSaldo && "xl:col-span-3")

  return (
    <section aria-labelledby="titulo-indicadores-principais">
      <h2 id="titulo-indicadores-principais" className="sr-only">
        Indicadores principais
      </h2>
      <div className="grid grid-flow-dense gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          fallback={<IndicadorCardSkeleton className={larguraPedidos} />}
        >
          <PedidosAEntregar className={larguraPedidos} />
        </Suspense>
        <Suspense fallback={<IndicadorCardSkeleton />}>
          <InsumosAbaixoDoMinimo />
        </Suspense>
        <Suspense
          fallback={<IndicadorCardSkeleton className={larguraOrdens} />}
        >
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
