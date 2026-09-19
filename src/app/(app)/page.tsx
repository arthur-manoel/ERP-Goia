import type { Metadata } from "next"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
export const metadata: Metadata = { title: "Início" }
export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Início"
        descricao="Acesse as áreas da operação da empresa."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          [
            "/estoque",
            "Controle de estoque",
            "Tecidos, aviamentos e produtos prontos.",
          ],
          [
            "/producao/ordens",
            "Ordens de produção",
            "Organize os lotes, as etapas e os prazos.",
          ],
          [
            "/cadastros/clientes",
            "Clientes e fornecedores",
            "Cadastros, documentos e endereços.",
          ],
          [
            "/vendas/pedidos",
            "Pedidos de venda",
            "Clientes, produtos e valores de cada pedido.",
          ],
          [
            "/financeiro",
            "Controle financeiro",
            "Contas a pagar, a receber e liquidações.",
          ],
        ].map(([href, title, description]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  )
}
