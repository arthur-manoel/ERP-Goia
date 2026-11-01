import { Alert, AlertDescription } from "@/components/ui/alert"
import type { Opcao } from "../tipos"
/** Informação auxiliar da seleção atual; não copia valores para compras antigas. */
export function CondicoesFornecedor({
  fornecedor,
}: {
  fornecedor: Pick<Opcao, "condicoesComerciais"> | null
}) {
  const conditions = fornecedor?.condicoesComerciais
  if (!conditions) return null
  const days = (value: number | null) =>
    value === null
      ? "não informado"
      : value === 0
        ? "imediato"
        : `${value} dias`
  return (
    <Alert>
      <AlertDescription>
        <p>
          Pagamento: {days(conditions.prazo_pagamento)} · Entrega:{" "}
          {days(conditions.prazo_entrega)}
        </p>
        {conditions.observacao && (
          <p className="break-words whitespace-pre-wrap">
            {conditions.observacao}
          </p>
        )}
        <p className="text-xs">
          Condições comerciais para consulta. Não geram parcelas
          automaticamente.
        </p>
      </AlertDescription>
    </Alert>
  )
}
