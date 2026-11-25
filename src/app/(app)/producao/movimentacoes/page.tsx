import type { Metadata } from "next"
import { MovimentacaoSetores } from "@/features/producao/components/movimentacao-setores"
export const metadata: Metadata = {
  title: "Apontamentos e movimentação de produção",
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ordem?: string | string[] }>
}) {
  const raw = (await searchParams).ordem
  const ordem =
    typeof raw === "string" &&
    /^[1-9]\d{0,9}$/.test(raw) &&
    Number(raw) <= 2147483647
      ? raw
      : ""
  return <MovimentacaoSetores ordemInicial={ordem} />
}
