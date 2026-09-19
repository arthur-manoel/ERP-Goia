import { Wallet } from "lucide-react"
import { obterSaldoDoMes } from "@/lib/dashboard/indicadores"
import { formatarMoeda } from "@/lib/formatacao"
import {
  IndicadorAlerta,
  IndicadorAlertas,
  IndicadorCard,
  IndicadorIndisponivel,
  IndicadorResumo,
  IndicadorValor,
} from "./indicador-card"
import { IndicadorTendencia } from "./indicador-graficos"
import {
  IndicadorComparativo,
  IndicadorDetalhes,
  IndicadorSecao,
  type DetalheIndicador,
} from "./indicador-secoes"

// Sem "link": o ERP ainda não tem tela financeira em config/navegacao.ts.
const base = {
  id: "indicador-saldo",
  titulo: "Saldo do mês",
  icone: Wallet,
}

/**
 * Indicador financeiro. Quem renderiza decide se o usuário pode vê-lo
 * (podeVerSaldoDoMes), e obterSaldoDoMes confere a permissão de novo no
 * servidor: se negar, este componente não renderiza nada.
 */
export async function SaldoDoMes({ className }: { className?: string }) {
  const resultado = await obterSaldoDoMes()
  if (resultado.estado !== "ok") {
    return (
      <IndicadorIndisponivel {...base} className={className} estado={resultado.estado} />
    )
  }

  const { valor, entradas, saidas, evolucaoDiaria, comparativo } = resultado.dados
  const negativo = Number(valor) < 0

  const detalhes: DetalheIndicador[] = []
  if (entradas !== undefined) {
    detalhes.push({ rotulo: "Entradas", valor: formatarMoeda(entradas) })
  }
  if (saidas !== undefined) {
    detalhes.push({ rotulo: "Saídas", valor: formatarMoeda(saidas) })
  }

  const serie = evolucaoDiaria?.map(Number) ?? []

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor valor={formatarMoeda(valor)} />
        {negativo && (
          <IndicadorAlertas>
            <IndicadorAlerta>Saldo negativo</IndicadorAlerta>
          </IndicadorAlertas>
        )}
        {comparativo && (
          <IndicadorComparativo
            atual={Number(valor)}
            anterior={Number(comparativo.valorAnterior)}
            rotulo={comparativo.rotulo}
            melhorQuando="maior"
            formatarDiferenca={formatarMoeda}
          />
        )}
      </IndicadorResumo>

      {serie.length >= 2 && (
        <IndicadorTendencia
          valores={serie}
          legenda="Saldo acumulado por dia no mês"
          descricao={`Saldo acumulado no mês: de ${formatarMoeda(serie[0])} no primeiro dia a ${formatarMoeda(serie[serie.length - 1])} no último dia registrado.`}
        />
      )}

      {detalhes.length > 0 && (
        <IndicadorSecao>
          <IndicadorDetalhes itens={detalhes} />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}
