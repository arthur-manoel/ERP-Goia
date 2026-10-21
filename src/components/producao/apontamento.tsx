"use client"

import { useState } from "react"
import { Info, Plus } from "lucide-react"

import { useErp } from "@/features/erp/components/provedor"
import { hoje as today } from "@/features/erp/datas"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * TODO (bloqueado no schema): não existe campo de perda/motivo em nenhuma
 * tabela do banco (`ordem_producao_item`, `ordem_producao_movimentacao_setor`
 * etc. só guardam quantidade produzida/movimentada, sem perda). Por isso os
 * apontamentos abaixo ficam só nesta sessão do navegador (não persistem).
 * Quando o schema ganhar essas colunas, trocar por `queries.ts`/`actions.ts`
 * reais em features/producao/.
 */
type Apontamento = {
  id: string
  ordemId: string
  etapa: string
  quantidadeProduzida: number
  quantidadePerdida: number
  motivoPerda: string
  data: string // aaaa-mm-dd
}

export function Apontamento() {
  const { data, error, reload } = useErp()

  const [apontamentos, setApontamentos] = useState<Apontamento[]>([])
  const [ordemId, setOrdemId] = useState("")
  const [etapa, setEtapa] = useState("")
  const [quantidadeProduzida, setQuantidadeProduzida] = useState("")
  const [quantidadePerdida, setQuantidadePerdida] = useState("0")
  const [motivoPerda, setMotivoPerda] = useState("")
  const [dataApontamento, setDataApontamento] = useState(today())
  const [erro, setErro] = useState("")

  const [filtroOrdem, setFiltroOrdem] = useState("todas")

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os dados</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {error}
          <Button variant="outline" onClick={() => void reload()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (!data)
    return (
      <div role="status" aria-label="Carregando dados" className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  const ordem = (id: string) =>
    data.productions.find((row) => row.id === id) ?? null

  const nomeProduto = (produtoId: string) =>
    data.materials.find((row) => row.id === produtoId)?.name ??
    "Produto não encontrado"

  function handleRegistrar() {
    setErro("")

    const produzida = Number(quantidadeProduzida)
    const perdida = Number(quantidadePerdida || "0")

    if (!ordemId) return setErro("Selecione a ordem de produção.")
    if (!etapa.trim()) return setErro("Informe a etapa.")
    if (!quantidadeProduzida || produzida <= 0)
      return setErro("Informe uma quantidade produzida maior que zero.")
    if (perdida < 0)
      return setErro("A quantidade perdida não pode ser negativa.")
    if (perdida > 0 && !motivoPerda.trim())
      return setErro("Informe o motivo da perda.")

    setApontamentos((atual) => [
      ...atual,
      {
        id: crypto.randomUUID(),
        ordemId,
        etapa: etapa.trim(),
        quantidadeProduzida: produzida,
        quantidadePerdida: perdida,
        motivoPerda: motivoPerda.trim(),
        data: dataApontamento,
      },
    ])

    setEtapa("")
    setQuantidadeProduzida("")
    setQuantidadePerdida("0")
    setMotivoPerda("")
  }

  const apontamentosFiltrados = apontamentos.filter(
    (item) => filtroOrdem === "todas" || item.ordemId === filtroOrdem,
  )

  const totalProduzido = apontamentosFiltrados.reduce(
    (soma, item) => soma + item.quantidadeProduzida,
    0,
  )
  const totalPerdido = apontamentosFiltrados.reduce(
    (soma, item) => soma + item.quantidadePerdida,
    0,
  )
  const taxaPerda =
    totalProduzido + totalPerdido > 0
      ? (totalPerdido / (totalProduzido + totalPerdido)) * 100
      : 0

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <Info aria-hidden />
        <AlertTitle>Apontamentos ainda não são gravados no banco</AlertTitle>
        <AlertDescription>
          Não existe campo de perda/motivo no schema hoje — os registros abaixo
          ficam só nesta sessão do navegador, para validar a tela.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Novo apontamento</CardTitle>
          <CardDescription>
            Registre o que foi produzido em uma etapa e, se houve perda, informe
            a quantidade e o motivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select value={ordemId} onValueChange={(v) => setOrdemId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Ordem de produção" />
              </SelectTrigger>
              <SelectContent>
                {data.productions.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.code} — {nomeProduto(row.productId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Etapa (ex.: Corte, Costura, Acabamento)"
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              placeholder="Quantidade produzida"
              value={quantidadeProduzida}
              onChange={(e) => setQuantidadeProduzida(e.target.value)}
            />
            <Input
              type="number"
              min={0}
              placeholder="Quantidade perdida"
              value={quantidadePerdida}
              onChange={(e) => setQuantidadePerdida(e.target.value)}
            />
            <Input
              placeholder="Motivo da perda (obrigatório se houver perda)"
              value={motivoPerda}
              onChange={(e) => setMotivoPerda(e.target.value)}
              className="sm:col-span-2"
            />
            <Input
              type="date"
              value={dataApontamento}
              onChange={(e) => setDataApontamento(e.target.value)}
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div>
            <Button onClick={handleRegistrar}>
              <Plus />
              Registrar apontamento
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total produzido
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {totalProduzido}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total perdido
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {totalPerdido}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de perda
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {taxaPerda.toFixed(1)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Apontamentos registrados</CardTitle>
            <CardDescription>
              Produção e perdas por etapa, nesta sessão.
            </CardDescription>
          </div>
          <Select
            value={filtroOrdem}
            onValueChange={(v) => setFiltroOrdem(v ?? "todas")}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filtrar por ordem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as ordens</SelectItem>
              {data.productions.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead className="text-right">Produzido</TableHead>
                  <TableHead className="text-right">Perdido</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apontamentosFiltrados.length ? (
                  apontamentosFiltrados.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {new Date(item.data + "T00:00:00").toLocaleDateString(
                          "pt-BR",
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {ordem(item.ordemId)?.code ?? "—"}
                      </TableCell>
                      <TableCell>{item.etapa}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantidadeProduzida}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantidadePerdida > 0 ? (
                          <Badge variant="destructive">
                            {item.quantidadePerdida}
                          </Badge>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell>{item.motivoPerda || "—"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>
                            Nenhum apontamento registrado.
                          </EmptyTitle>
                          <EmptyDescription>
                            Use o formulário acima para registrar o primeiro.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
