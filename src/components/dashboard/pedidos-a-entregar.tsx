import { PackageCheck } from "lucide-react"
import { obterPedidosAEntregar } from "@/lib/dashboard/indicadores"
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao"
import {
  IndicadorAlerta,
  IndicadorAlertas,
  IndicadorCard,
  IndicadorIndisponivel,
  IndicadorResumo,
  IndicadorValor,
} from "./indicador-card"
import { IndicadorRosca, type SegmentoLegenda } from "./indicador-graficos"
import {
  IndicadorComparativo,
  IndicadorDetalhes,
  IndicadorSecao,
  type DetalheIndicador,
} from "./indicador-secoes"

const base = {
  id: "indicador-pedidos",
  titulo: "Pedidos a entregar",
  icone: PackageCheck,
  link: { href: "/vendas", rotulo: "Ver pedidos" },
}

export async function PedidosAEntregar({ className }: { className?: string }) {
  const resultado = await obterPedidosAEntregar()
  if (resultado.estado !== "ok") {
    return (
      <IndicadorIndisponivel
        {...base}
        className={className}
        estado={resultado.estado}
      />
    )
  }

  const {
    total,
    atrasados,
    vencemHoje,
    proximos,
    maiorAtrasoEmDias,
    valorPendente,
    comparativo,
  } = resultado.dados

  // "Demais" é aritmética simples (total menos os grupos acima), não um dado novo.
  const demais = total - atrasados - vencemHoje - proximos.quantidade
  const segmentos: SegmentoLegenda[] = [
    {
      rotulo: "Atrasados",
      quantidade: atrasados,
      cor: "var(--destructive)",
      destaque: true,
    },
    { rotulo: "Vencem hoje", quantidade: vencemHoje, cor: "var(--primary)" },
    {
      rotulo:
        proximos.janelaDias === 1
          ? "Vencem amanhã"
          : `Vencem nos próximos ${proximos.janelaDias} dias`,
      quantidade: proximos.quantidade,
      cor: "var(--chart-2)",
    },
  ]
  if (demais > 0) {
    segmentos.push({
      rotulo: "Demais pedidos",
      quantidade: demais,
      cor: "var(--border)",
    })
  }

  const detalhes: DetalheIndicador[] = []
  if (maiorAtrasoEmDias !== undefined && maiorAtrasoEmDias > 0) {
    detalhes.push({
      rotulo: "Maior atraso",
      valor: `${maiorAtrasoEmDias} ${maiorAtrasoEmDias === 1 ? "dia" : "dias"}`,
      destaque: true,
    })
  }
  if (valorPendente !== undefined) {
    detalhes.push({
      rotulo: "Valor pendente",
      valor: formatarMoeda(valorPendente),
    })
  }

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor
          valor={formatarQuantidade(total, 0)}
          unidade={total === 1 ? "pedido" : "pedidos"}
        />
        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum pedido pendente de entrega.
          </p>
        )}
        {atrasados > 0 && (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {atrasados === 1 ? "1 atrasado" : `${atrasados} atrasados`}
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

      {total > 0 && (
        <IndicadorSecao titulo="Prazos de entrega">
          <IndicadorRosca segmentos={segmentos} total={total} />
        </IndicadorSecao>
      )}

      {total > 0 && detalhes.length > 0 && (
        <IndicadorSecao>
          <IndicadorDetalhes itens={detalhes} />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}
