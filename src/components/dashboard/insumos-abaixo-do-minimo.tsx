import { Warehouse } from "lucide-react"
import { obterInsumosAbaixoDoMinimo } from "@/lib/dashboard/indicadores"
import { formatarQuantidade } from "@/lib/formatacao"
import {
  IndicadorAlerta,
  IndicadorAlertas,
  IndicadorCard,
  IndicadorIndisponivel,
  IndicadorResumo,
  IndicadorValor,
} from "./indicador-card"
import {
  IndicadorComparativo,
  IndicadorDetalhes,
  IndicadorMedidor,
  IndicadorSecao,
} from "./indicador-secoes"

const base = {
  id: "indicador-insumos",
  titulo: "Insumos abaixo do mínimo",
  icone: Warehouse,
  link: { href: "/estoque", rotulo: "Ver estoque" },
}

export async function InsumosAbaixoDoMinimo({
  className,
}: {
  className?: string
}) {
  const resultado = await obterInsumosAbaixoDoMinimo()
  if (resultado.estado !== "ok") {
    return (
      <IndicadorIndisponivel
        {...base}
        className={className}
        estado={resultado.estado}
      />
    )
  }

  const { total, semEstoque, totalMonitorados, maisCriticos, comparativo } =
    resultado.dados

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor
          valor={formatarQuantidade(total, 0)}
          unidade={total === 1 ? "item" : "itens"}
        />
        {total > 0 ? (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {semEstoque
                ? `${semEstoque} sem estoque`
                : "Atenção: repor estoque"}
            </IndicadorAlerta>
          </IndicadorAlertas>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todos os insumos estão dentro do mínimo.
          </p>
        )}
        {comparativo && (
          <IndicadorComparativo
            atual={total}
            anterior={comparativo.valorAnterior}
            rotulo={comparativo.rotulo}
            melhorQuando="menor"
            formatarDiferenca={(n) => formatarQuantidade(n, 0)}
          />
        )}
      </IndicadorResumo>

      {maisCriticos && maisCriticos.length > 0 && (
        <IndicadorSecao titulo="Mais críticos (nível em relação ao mínimo)">
          <div className="flex flex-col gap-3">
            {maisCriticos.map((insumo) => {
              const minimo = Number(insumo.minimo)
              const nivel =
                minimo > 0 ? (Number(insumo.saldo) / minimo) * 100 : 0
              return (
                <IndicadorMedidor
                  key={insumo.id}
                  rotulo={insumo.nome}
                  percentual={Math.round(nivel)}
                  detalhe={`Saldo ${formatarQuantidade(insumo.saldo)} de ${formatarQuantidade(insumo.minimo)} ${insumo.unidade}`}
                />
              )
            })}
          </div>
        </IndicadorSecao>
      )}

      {totalMonitorados !== undefined && (
        <IndicadorSecao>
          <IndicadorDetalhes
            itens={[
              {
                rotulo: "Insumos monitorados",
                valor: formatarQuantidade(totalMonitorados, 0),
              },
            ]}
          />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}
