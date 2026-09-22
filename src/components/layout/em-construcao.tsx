import { Construction } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type EmConstrucaoProps = {
  /** Tabelas do banco que a tela vai usar. */
  tabelas: string[]
}

/** Placeholder das telas ainda não implementadas. Substitua pelo conteúdo real. */
export function EmConstrucao({ tabelas }: EmConstrucaoProps) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Construction />
        </EmptyMedia>
        <EmptyTitle>Tela em construção</EmptyTitle>
        <EmptyDescription>
          Veja a issue correspondente no GitHub e o guia em docs/ARQUITETURA.md.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {tabelas.map((tabela) => (
            <Badge key={tabela} variant="secondary" className="font-mono">
              {tabela}
            </Badge>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  )
}
