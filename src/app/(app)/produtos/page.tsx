import type { Metadata } from "next"
import { ProdutosProntosView } from "@/features/produtos/components/produtos-prontos-view"

export const metadata: Metadata = { title: "Produtos" }

export default function Page() {
  return <ProdutosProntosView />
}
