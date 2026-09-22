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
  IndicadorDetalhes,
  IndicadorMedidor,
  IndicadorSecao,
} from "./indicador-secoes"

const base = {
  id: "indicador-insumos",
  titulo: "Estoque crítico por local",
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

  const { total, semEstoque, semMinimo, totalMonitorados, maisCriticos } =
    resultado.dados

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor
          valor={formatarQuantidade(total, 0)}
          unidade={total === 1 ? "posição" : "posições"}
        />
        {total > 0 ? (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {semEstoque
                ? `${semEstoque} sem estoque físico`
                : "Há reposição necessária"}
            </IndicadorAlerta>
          </IndicadorAlertas>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma posição monitorada está no mínimo ou abaixo.
          </p>
        )}
        {!!semMinimo && (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {semMinimo} {semMinimo === 1 ? "posição sem" : "posições sem"}
              {" mínimo configurado"}
            </IndicadorAlerta>
          </IndicadorAlertas>
        )}
      </IndicadorResumo>

      {maisCriticos && maisCriticos.length > 0 && (
        <IndicadorSecao titulo="Mais críticos por depósito/localização">
          <div className="flex flex-col gap-3">
            {maisCriticos.map((item) => {
              const minimo = Number(item.minimo)
              const nivel = minimo > 0 ? (Number(item.saldo) / minimo) * 100 : 0
              return (
                <IndicadorMedidor
                  key={item.id}
                  rotulo={`${item.nome} · ${item.local}`}
                  percentual={Math.round(nivel)}
                  detalhe={`${item.tipo} · Saldo ${formatarQuantidade(item.saldo)} de ${formatarQuantidade(item.minimo)} ${item.unidade} · Déficit ${formatarQuantidade(item.deficit)}`}
                />
              )
            })}
          </div>
        </IndicadorSecao>
      )}

      {(totalMonitorados !== undefined || semMinimo !== undefined) && (
        <IndicadorSecao>
          <IndicadorDetalhes
            itens={[
              ...(totalMonitorados !== undefined
                ? [
                    {
                      rotulo: "Posições monitoradas",
                      valor: formatarQuantidade(totalMonitorados, 0),
                    },
                  ]
                : []),
              ...(semMinimo !== undefined
                ? [
                    {
                      rotulo: "Sem mínimo local",
                      valor: formatarQuantidade(semMinimo, 0),
                    },
                  ]
                : []),
            ]}
          />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}
