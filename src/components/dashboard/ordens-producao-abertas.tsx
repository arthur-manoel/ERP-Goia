import { Factory } from "lucide-react"
import { obterOrdensProducaoAbertas } from "@/lib/dashboard/indicadores"
import { formatarQuantidade } from "@/lib/formatacao"
import {
  IndicadorAlerta,
  IndicadorAlertas,
  IndicadorCard,
  IndicadorIndisponivel,
  IndicadorResumo,
  IndicadorValor,
} from "./indicador-card"
import { CORES_ROSCA, IndicadorRosca } from "./indicador-graficos"
import { IndicadorComparativo, IndicadorSecao } from "./indicador-secoes"

const base = {
  id: "indicador-ordens-producao",
  titulo: "Ordens de produção",
  icone: Factory,
  link: { href: "/producao/ordens", rotulo: "Ver produção" },
}

export async function OrdensProducaoAbertas({ className }: { className?: string }) {
  const resultado = await obterOrdensProducaoAbertas()
  if (resultado.estado !== "ok") {
    return (
      <IndicadorIndisponivel {...base} className={className} estado={resultado.estado} />
    )
  }

  const { total, porStatus, atrasadas, comparativo } = resultado.dados

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor
          valor={formatarQuantidade(total, 0)}
          unidade={total === 1 ? "aberta" : "abertas"}
        />
        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma ordem de produção aberta.
          </p>
        )}
        {atrasadas !== undefined && atrasadas > 0 && (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {atrasadas === 1 ? "1 atrasada" : `${atrasadas} atrasadas`}
            </IndicadorAlerta>
          </IndicadorAlertas>
        )}
        {comparativo && (
          <IndicadorComparativo
            atual={total}
            anterior={comparativo.valorAnterior}
            rotulo={comparativo.rotulo}
            melhorQuando="neutro"
            formatarDiferenca={(n) => formatarQuantidade(n, 0)}
          />
        )}
      </IndicadorResumo>

      {total > 0 && porStatus && porStatus.length > 0 && (
        <IndicadorSecao titulo="Por status">
          <IndicadorRosca
            total={total}
            segmentos={porStatus.map((status, indice) => ({
              rotulo: status.rotulo,
              quantidade: status.quantidade,
              cor: CORES_ROSCA[indice % CORES_ROSCA.length],
            }))}
          />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}
