import Link from "next/link"
import { OperacoesEstoque } from "@/features/reservas/components/operacoes-estoque"

export function TelaOrdensProducao() {
  return (
    <>
      <Link className="underline" href="/producao/movimentacoes">
        Apontamentos e movimentação entre setores
      </Link>
      <OperacoesEstoque origem="PRODUCAO" />
    </>
  )
}
