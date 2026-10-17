import { CircleAlert, Minus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  chaveVariacao,
  type CorDisponivel,
  type TamanhoDisponivel,
  type VariacaoProduto,
} from "../schemas"

type Props = {
  cores: CorDisponivel[]
  tamanhos: TamanhoDisponivel[]
  variacoes: VariacaoProduto[]
}

function Saldo({ quantidade }: { quantidade: number }) {
  if (quantidade === 0)
    return (
      <Badge variant="destructive" className="tabular-nums">
        <CircleAlert /> 0
      </Badge>
    )

  if (quantidade <= 3)
    return (
      <Badge variant="secondary" className="tabular-nums">
        <Minus /> {quantidade.toLocaleString("pt-BR")}
      </Badge>
    )

  return (
    <span className="tabular-nums">{quantidade.toLocaleString("pt-BR")}</span>
  )
}

export function MatrizGradeSaldo({ cores, tamanhos, variacoes }: Props) {
  const saldos = new Map(
    variacoes.map((variacao) => [
      chaveVariacao(variacao.corId, variacao.tamanhoId),
      variacao.saldo,
    ]),
  )

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-36">Cor / Tamanho</TableHead>
            {tamanhos.map((tamanho) => (
              <TableHead key={tamanho.id} className="min-w-20 text-center">
                {tamanho.nome}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cores.map((cor) => (
            <TableRow key={cor.id}>
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  <span
                    aria-label={`Cor ${cor.nome}`}
                    className="size-4 rounded-full border shadow-sm"
                    style={{ backgroundColor: cor.hexadecimal }}
                  />
                  {cor.nome}
                </span>
              </TableCell>
              {tamanhos.map((tamanho) => (
                <TableCell key={tamanho.id} className="text-center">
                  <Saldo
                    quantidade={
                      saldos.get(chaveVariacao(cor.id, tamanho.id)) ?? 0
                    }
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
