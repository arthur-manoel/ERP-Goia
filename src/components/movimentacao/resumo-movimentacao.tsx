import { formatarQuantidade } from "@/lib/formatacao"
import {
  rotuloTipo,
  type ResumoMovimentacaoDados,
} from "@/lib/movimentacao/tipos"

function Linha({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <>
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </>
  )
}

export function ResumoMovimentacao({
  resumo,
}: {
  resumo: ResumoMovimentacaoDados
}) {
  const { tipo, item, origem, destino, quantidade, observacao } = resumo
  // A quantidade vem em texto ("50", "12.5"): mostra só as casas que o usuário digitou.
  const casas = quantidade.split(".")[1]?.length ?? 0

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
      <Linha rotulo="Operação">{rotuloTipo[tipo]}</Linha>
      <Linha rotulo="Item">
        {item.nome}{" "}
        <span className="font-normal text-muted-foreground">
          ({item.codigo})
        </span>
      </Linha>
      {origem && <Linha rotulo="Origem">{origem.nome}</Linha>}
      {destino && <Linha rotulo="Destino">{destino.nome}</Linha>}
      <Linha rotulo="Quantidade">
        {formatarQuantidade(quantidade, casas)} {item.unidade}
      </Linha>
      {observacao && <Linha rotulo="Observação">{observacao}</Linha>}
    </dl>
  )
}
