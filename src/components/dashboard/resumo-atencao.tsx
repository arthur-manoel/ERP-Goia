import Link from "next/link"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  obterInsumosAbaixoDoMinimo,
  obterOrdensProducaoAbertas,
  obterPedidosAEntregar,
  obterSaldoDoMes,
} from "@/lib/dashboard/indicadores"

type Pendencia = { chave: string; texto: string; href?: string }

const plural = (n: number, singular: string, pluralizado: string) =>
  `${n} ${n === 1 ? singular : pluralizado}`

/**
 * Faixa no topo que junta, em uma linha, o que exige ação hoje. Usa os MESMOS
 * dados dos cards (cache por requisição), então nunca mostra algo que os cards
 * não mostrem. Some por completo quando não há pendência.
 */
export async function ResumoAtencao({ mostrarSaldo }: { mostrarSaldo: boolean }) {
  const [insumos, ordens, pedidos, saldo] = await Promise.all([
    obterInsumosAbaixoDoMinimo(),
    obterOrdensProducaoAbertas(),
    obterPedidosAEntregar(),
    // O saldo só entra se o usuário pode vê-lo (e a função ainda confere no servidor).
    mostrarSaldo ? obterSaldoDoMes() : Promise.resolve(null),
  ])

  const pendencias: Pendencia[] = []

  if (pedidos.estado === "ok" && pedidos.dados.atrasados > 0) {
    pendencias.push({
      chave: "pedidos",
      texto: plural(pedidos.dados.atrasados, "pedido atrasado", "pedidos atrasados"),
      href: "/vendas",
    })
  }
  if (ordens.estado === "ok" && (ordens.dados.atrasadas ?? 0) > 0) {
    pendencias.push({
      chave: "ordens",
      texto: plural(
        ordens.dados.atrasadas ?? 0,
        "ordem de produção atrasada",
        "ordens de produção atrasadas",
      ),
      href: "/producao/ordens",
    })
  }
  if (insumos.estado === "ok" && insumos.dados.total > 0) {
    const { total, semEstoque } = insumos.dados
    pendencias.push({
      chave: "insumos",
      texto: semEstoque
        ? plural(semEstoque, "insumo sem estoque", "insumos sem estoque")
        : plural(total, "insumo abaixo do mínimo", "insumos abaixo do mínimo"),
      href: "/estoque",
    })
  }
  if (saldo?.estado === "ok" && Number(saldo.dados.valor) < 0) {
    pendencias.push({ chave: "saldo", texto: "Saldo do mês negativo" })
  }

  if (pendencias.length === 0) return null

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Precisa de atenção</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {pendencias.map((pendencia) => (
            <li key={pendencia.chave}>
              {pendencia.href ? (
                <Link
                  href={pendencia.href}
                  className="font-medium underline underline-offset-4 hover:no-underline"
                >
                  {pendencia.texto}
                </Link>
              ) : (
                <span className="font-medium">{pendencia.texto}</span>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
