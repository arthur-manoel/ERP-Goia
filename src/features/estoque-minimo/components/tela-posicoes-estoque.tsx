"use client"

import { useMemo, useState } from "react"
import {
  Check,
  CircleAlert,
  Minus,
  PackageOpen,
  Pencil,
  Search,
  Settings2,
  TriangleAlert,
} from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarQuantidade } from "@/lib/formatacao"
import type { EstadoPosicaoEstoque, PosicaoEstoque } from "../tipos"
import { FormularioMinimoLocal } from "./formulario-minimo-local"

type FiltroEstado = EstadoPosicaoEstoque | "TODOS"

const rotulos: Record<EstadoPosicaoEstoque, string> = {
  SEM_ESTOQUE: "Sem estoque",
  ABAIXO_MINIMO: "Abaixo do mínimo",
  NO_MINIMO: "No mínimo",
  REGULAR: "Regular",
  NAO_CONFIGURADO: "Mínimo não configurado",
}

const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

function BadgeEstado({ estado }: { estado: EstadoPosicaoEstoque }) {
  if (estado === "SEM_ESTOQUE")
    return (
      <Badge variant="destructive">
        <CircleAlert /> Sem estoque
      </Badge>
    )
  if (estado === "ABAIXO_MINIMO")
    return (
      <Badge variant="destructive">
        <TriangleAlert /> Abaixo do mínimo
      </Badge>
    )
  if (estado === "NO_MINIMO")
    return (
      <Badge variant="secondary">
        <Minus /> No mínimo
      </Badge>
    )
  if (estado === "NAO_CONFIGURADO")
    return (
      <Badge variant="outline">
        <Settings2 /> Não configurado
      </Badge>
    )
  return (
    <Badge variant="outline">
      <Check /> Regular
    </Badge>
  )
}

export function TelaPosicoesEstoque({
  posicoes,
  podeEditar,
  titulo,
  descricao,
}: {
  posicoes: PosicaoEstoque[]
  podeEditar: boolean
  titulo: string
  descricao: string
}) {
  const [busca, setBusca] = useState("")
  const [estado, setEstado] = useState<FiltroEstado>("TODOS")
  const [selecionada, setSelecionada] = useState<PosicaoEstoque | null>(null)

  const filtradas = useMemo(
    () =>
      posicoes.filter((posicao) => {
        const correspondeEstado =
          estado === "TODOS" || posicao.estado === estado
        const texto = normalizar(
          `${posicao.produto} ${posicao.codigo} ${posicao.tipo} ${posicao.local}`,
        )
        return correspondeEstado && texto.includes(normalizar(busca))
      }),
    [busca, estado, posicoes],
  )

  const alertas = posicoes.filter((posicao) =>
    ["SEM_ESTOQUE", "ABAIXO_MINIMO", "NO_MINIMO"].includes(posicao.estado),
  ).length
  const zeradas = posicoes.filter(
    (posicao) => posicao.estado === "SEM_ESTOQUE",
  ).length
  const semMinimo = posicoes.filter(
    (posicao) => posicao.estado === "NAO_CONFIGURADO",
  ).length

  return (
    <>
      <PageHeader titulo={titulo} descricao={descricao} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Posições físicas", posicoes.length],
          ["No mínimo ou abaixo", alertas],
          ["Sem estoque", zeradas],
          ["Sem mínimo configurado", semMinimo],
        ].map(([rotulo, valor]) => (
          <Card key={rotulo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {rotulo}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {valor}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar posições de estoque"
            className="pl-9"
            placeholder="Buscar produto, código, tipo ou local..."
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
        <SearchSelect
          value={estado}
          onValueChange={(valor) =>
            setEstado((valor || "TODOS") as FiltroEstado)
          }
          label="Filtrar por situação"
          className="w-full sm:w-[240px]"
          options={[
            { value: "TODOS", label: "Todas as situações" },
            ...Object.entries(rotulos).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Depósito / localização</TableHead>
              <TableHead className="text-right">Estoque físico</TableHead>
              <TableHead className="text-right">Mínimo local</TableHead>
              <TableHead className="text-right">Déficit</TableHead>
              <TableHead>Situação</TableHead>
              {podeEditar && (
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((posicao) => {
              const alerta = ["SEM_ESTOQUE", "ABAIXO_MINIMO"].includes(
                posicao.estado,
              )
              return (
                <TableRow
                  key={posicao.idEstoque}
                  className={alerta ? "bg-destructive/5" : undefined}
                >
                  <TableCell>
                    <p className="font-medium">{posicao.produto}</p>
                    <p className="text-xs text-muted-foreground">
                      {posicao.codigo}
                    </p>
                  </TableCell>
                  <TableCell>{posicao.tipo}</TableCell>
                  <TableCell className="font-medium">{posicao.local}</TableCell>
                  <TableCell
                    className={
                      alerta
                        ? "text-right font-medium text-destructive tabular-nums"
                        : "text-right tabular-nums"
                    }
                  >
                    {formatarQuantidade(posicao.quantidade)} {posicao.unidade}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {posicao.minimo === null
                      ? "Não configurado"
                      : `${formatarQuantidade(posicao.minimo)} ${posicao.unidade}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {posicao.deficit !== null && Number(posicao.deficit) > 0
                      ? `${formatarQuantidade(posicao.deficit)} ${posicao.unidade}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <BadgeEstado estado={posicao.estado} />
                  </TableCell>
                  {podeEditar && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Configurar mínimo de ${posicao.produto} em ${posicao.local}`}
                        onClick={() => setSelecionada(posicao)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
            {!filtradas.length && (
              <TableRow>
                <TableCell colSpan={podeEditar ? 8 : 7} className="p-0">
                  <Empty className="py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PackageOpen />
                      </EmptyMedia>
                      <EmptyTitle>Nenhuma posição encontrada</EmptyTitle>
                      <EmptyDescription>
                        {posicoes.length
                          ? "Altere a busca ou o filtro para consultar outras posições."
                          : "Ainda não há saldo físico registrado nos locais ativos desta empresa."}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground" role="status">
        {filtradas.length} de {posicoes.length} posições exibidas. A quantidade
        reservada não altera este alerta, que usa somente o estoque físico.
      </p>

      {selecionada && (
        <FormularioMinimoLocal
          posicao={selecionada}
          onClose={() => setSelecionada(null)}
        />
      )}
    </>
  )
}
