import { Cancelamentos } from "@/features/cancelamentos/components/cancelamentos"
export const metadata = { title: "Cancelamentos e estornos" }
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; cancelamento?: string }>
}) {
  const p = await searchParams
  const id = (s?: string) =>
    s && /^[1-9]\d{0,9}$/.test(s) && Number(s) <= 2147483647
      ? Number(s)
      : undefined
  return (
    <Cancelamentos
      pedidoInicial={id(p.pedido)}
      cancelamentoInicial={id(p.cancelamento)}
    />
  )
}
