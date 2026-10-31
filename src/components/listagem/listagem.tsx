"use client"

import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ControleListagem } from "@/hooks/use-listagem"
import { PaginacaoListagem } from "./paginacao-listagem"

export type ColunaListagem<T> = {
  id: string
  cabecalho: ReactNode
  celula: (item: T) => ReactNode
  /** Classe aplicada ao cabeçalho e às células da coluna. */
  className?: string
  /** Com este campo a coluna é ordenável; só use se a fonte enviar a ordenação à API. */
  campoOrdenacao?: string
}

export type AcaoRegistro<T> = {
  rotulo: string
  icone?: ReactNode
  aoSelecionar: (item: T) => void
  destrutiva?: boolean
  desabilitada?: (item: T) => boolean
  oculta?: (item: T) => boolean
}

type Props<T, M> = {
  listagem: ControleListagem<T, M>
  colunas: ColunaListagem<T>[]
  chaveItem: (item: T) => string | number
  /** Nome da tabela, usado em rótulos de acessibilidade ("Fornecedores"). */
  rotulo: string
  substantivo: { singular: string; plural: string }
  vazio: { icone: ReactNode; titulo: string; descricao: string }
  /** Menu de ações por registro (editar, excluir, visualizar...). */
  acoes?: AcaoRegistro<T>[]
  rotuloAcoesDe?: (item: T) => string
}

function IconeOrdenacao({ direcao }: { direcao: "asc" | "desc" | null }) {
  if (direcao === "asc") return <ArrowUp aria-hidden className="size-3.5" />
  if (direcao === "desc") return <ArrowDown aria-hidden className="size-3.5" />
  return <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />
}

/**
 * Tabela de uma listagem: renderiza erro, carregamento, lista vazia e dados,
 * mais a paginação. Não busca dados nem conhece o módulo: recebe o controle
 * de `useListagem` e a configuração de colunas e ações.
 */
export function Listagem<T, M = undefined>({
  listagem,
  colunas,
  chaveItem,
  rotulo,
  substantivo,
  vazio,
  acoes = [],
  rotuloAcoesDe,
}: Props<T, M>) {
  if (listagem.estado === "erro")
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription className="space-y-3">
          <p>{listagem.erro}</p>
          <Button variant="outline" onClick={listagem.recarregar}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (listagem.estado === "carregando")
    return (
      <Skeleton
        role="status"
        aria-label={`Carregando ${rotulo.toLowerCase()}`}
        className="h-64 w-full"
      />
    )

  if (listagem.estado === "vazio")
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{vazio.icone}</EmptyMedia>
          <EmptyTitle>
            {listagem.possuiFiltros ? "Nenhum resultado" : vazio.titulo}
          </EmptyTitle>
          <EmptyDescription>
            {listagem.possuiFiltros
              ? "Ajuste a busca ou os filtros."
              : vazio.descricao}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const temAcoes = acoes.length > 0
  return (
    <div className="space-y-3">
      <div
        aria-busy={listagem.atualizando}
        className={
          listagem.atualizando
            ? "overflow-x-auto rounded-lg border opacity-60 transition-opacity"
            : "overflow-x-auto rounded-lg border"
        }
      >
        <Table aria-label={rotulo}>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna) => {
                const campo = coluna.campoOrdenacao
                const direcao =
                  campo && listagem.ordenacao?.campo === campo
                    ? listagem.ordenacao.direcao
                    : null
                return (
                  <TableHead
                    key={coluna.id}
                    className={coluna.className}
                    aria-sort={
                      campo
                        ? direcao === "asc"
                          ? "ascending"
                          : direcao === "desc"
                            ? "descending"
                            : "none"
                        : undefined
                    }
                  >
                    {campo ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        onClick={() => listagem.alternarOrdenacao(campo)}
                      >
                        {coluna.cabecalho}
                        <IconeOrdenacao direcao={direcao} />
                      </Button>
                    ) : (
                      coluna.cabecalho
                    )}
                  </TableHead>
                )
              })}
              {temAcoes && (
                <TableHead className="w-12">
                  <span className="sr-only">Ações</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listagem.itens.map((item) => {
              const visiveis = acoes.filter((acao) => !acao.oculta?.(item))
              const destrutivas = visiveis.filter((acao) => acao.destrutiva)
              const comuns = visiveis.filter((acao) => !acao.destrutiva)
              return (
                <TableRow key={chaveItem(item)}>
                  {colunas.map((coluna) => (
                    <TableCell key={coluna.id} className={coluna.className}>
                      {coluna.celula(item)}
                    </TableCell>
                  ))}
                  {temAcoes && (
                    <TableCell>
                      {visiveis.length > 0 && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={listagem.atualizando}
                                aria-label={
                                  rotuloAcoesDe?.(item) ?? "Ações do registro"
                                }
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              {comuns.map((acao) => (
                                <DropdownMenuItem
                                  key={acao.rotulo}
                                  disabled={acao.desabilitada?.(item)}
                                  onClick={() => acao.aoSelecionar(item)}
                                >
                                  {acao.icone} {acao.rotulo}
                                </DropdownMenuItem>
                              ))}
                              {comuns.length > 0 && destrutivas.length > 0 && (
                                <DropdownMenuSeparator />
                              )}
                              {destrutivas.map((acao) => (
                                <DropdownMenuItem
                                  key={acao.rotulo}
                                  variant="destructive"
                                  disabled={acao.desabilitada?.(item)}
                                  onClick={() => acao.aoSelecionar(item)}
                                >
                                  {acao.icone} {acao.rotulo}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <PaginacaoListagem
        pagina={listagem.pagina}
        limite={listagem.limite}
        total={listagem.total}
        totalPaginas={listagem.totalPaginas}
        substantivo={substantivo}
        desabilitado={listagem.atualizando}
        onPagina={listagem.irParaPagina}
      />
    </div>
  )
}
