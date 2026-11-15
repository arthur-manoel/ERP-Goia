"use client"

import Link from "next/link"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { useIndicador } from "./provedor-indicadores"

type Pendencia = { chave: string; texto: string; href?: string }

const plural = (n: number, singular: string, pluralizado: string) =>
  `${n} ${n === 1 ? singular : pluralizado}`

export function ResumoAtencao() {
  const ordens = useIndicador("ordens")
  const pedidos = useIndicador("pedidos")
  const saldo = useIndicador("saldo")

  const pendencias: Pendencia[] = []

  if (pedidos?.estado === "ok" && pedidos.dados.atrasados > 0) {
    pendencias.push({
      chave: "pedidos",
      texto: plural(
        pedidos.dados.atrasados,
        "pedido atrasado",
        "pedidos atrasados",
      ),
      href: "/vendas/pedidos",
    })
  }
  if (ordens?.estado === "ok" && (ordens.dados.atrasadas ?? 0) > 0) {
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
