"use client"

import { useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const rotulos = {
  RASCUNHO: "Rascunho",
  CONFIRMADO: "Confirmado",
  EM_PRODUCAO: "Em produção",
  PRONTO: "Pronto",
  EM_ENTREGA: "Em entrega",
  PARCIALMENTE_ENTREGUE: "Parcialmente entregue",
  ENTREGUE: "Entregue",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
}
type Resultado = {
  dados: {
    idItem: number
    pedido: string
    cliente: string
    item: string
    quantidade: string
    status: keyof typeof rotulos
    reservada: string
    entregue: string
    pendente: string
    emTransito: string
    pendenteEstoque: string
    cobertura: "ATENDIDO" | "EM_TRANSITO" | "TOTAL" | "PARCIAL" | "SEM_RESERVA"
    ordens: { id: number; numero: string; status: string }[]
  }[]
  paginacao: { pagina: number; totalPaginas: number }
}

export function SituacaoPedidos() {
  const { estado, empresa, usuario, empresas, selecionarEmpresa } =
    useAutenticacao()
  if (estado === "carregando") return <Skeleton className="h-96 w-full" />
  return (
    <div className="flex flex-col gap-6">
      {estado === "autenticado" && empresas.length > 1 && (
        <SearchSelect
          value={empresa ? String(empresa.id) : ""}
          onValueChange={(v) => selecionarEmpresa(Number(v))}
          label="Empresa ativa"
          placeholder="Selecione uma empresa"
          options={empresas.map((e) => ({
            value: String(e.id),
            label: e.nome,
          }))}
        />
      )}
      {estado !== "autenticado" || !empresa ? (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa para consultar os
            pedidos.
          </AlertDescription>
        </Alert>
      ) : (
        <SituacaoEmpresa key={`${usuario?.email}:${empresa.id}`} />
      )}
    </div>
  )
}

function SituacaoEmpresa() {
  const { requisitar } = useAutenticacao()
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState("todos")
  const [pagina, setPagina] = useState(1)
  const [tentativa, setTentativa] = useState(0)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setCarregando(true)
      setErro("")
      try {
        const query = new URLSearchParams({ busca, pagina: String(pagina) })
        if (status !== "todos") query.set("status", status)
        const resposta = await requisitar(`/api/pedidos/situacao?${query}`, {
          signal: controller.signal,
        })
        const json = await resposta.json()
        if (!resposta.ok)
          throw new Error(
            json.error ?? "Não foi possível consultar os pedidos.",
          )
        if (!controller.signal.aborted) setResultado(json)
      } catch (error) {
        if (!controller.signal.aborted)
          setErro(
            error instanceof Error
              ? error.message
              : "Não foi possível consultar os pedidos.",
          )
      } finally {
        if (!controller.signal.aborted) setCarregando(false)
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [busca, status, pagina, tentativa, requisitar])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Buscar por pedido ou cliente"
          placeholder="Buscar por pedido ou cliente..."
          maxLength={100}
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
            setCarregando(true)
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            if ((v ?? "todos") === status) return
            setStatus(v ?? "todos")
            setPagina(1)
            setCarregando(true)
          }}
        >
          <SelectTrigger className="w-[230px]" aria-label="Status do pedido">
            <SelectValue>
              {status === "todos"
                ? "Todos os status"
                : rotulos[status as keyof typeof rotulos]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(rotulos).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {erro ? (
        <Alert variant="destructive">
          <AlertDescription>
            {erro}
            <Button
              variant="outline"
              onClick={() => setTentativa((v) => v + 1)}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando ? (
        <Skeleton className="h-96 w-full" aria-label="Carregando pedidos" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Pedido",
                    "Cliente",
                    "Item",
                    "Quantidade",
                    "Status do pedido",
                    "Cobertura por estoque",
                    "Ordem vinculada",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado?.dados.length ? (
                  resultado.dados.map((linha) => (
                    <TableRow key={linha.idItem}>
                      <TableCell>{linha.pedido}</TableCell>
                      <TableCell>{linha.cliente}</TableCell>
                      <TableCell>{linha.item}</TableCell>
                      <TableCell>{linha.quantidade}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            linha.status === "CANCELADO"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {rotulos[linha.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {linha.cobertura === "ATENDIDO"
                            ? "Item atendido"
                            : linha.cobertura === "EM_TRANSITO"
                              ? "Em trânsito"
                              : linha.cobertura === "TOTAL"
                                ? "Coberto por estoque"
                                : linha.cobertura === "PARCIAL"
                                  ? "Cobertura parcial"
                                  : "Sem reserva"}
                        </Badge>
                        <div className="text-sm text-muted-foreground">
                          {linha.entregue} entregues · {linha.emTransito} em
                          trânsito · {linha.pendente} pendentes de entrega
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {linha.reservada} reservados de{" "}
                          {linha.pendenteEstoque} pendentes de estoque
                        </div>
                      </TableCell>
                      <TableCell>
                        {linha.ordens.length ? (
                          <div className="flex flex-wrap gap-1">
                            {linha.ordens.map((o) => (
                              <Badge key={o.id} variant="outline">
                                {o.numero} ·{" "}
                                {o.status.replaceAll("_", " ").toLowerCase()}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      Nenhum pedido encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">
            A cobertura considera o saldo das reservas ativas do item. As OPs
            exibidas possuem vínculo com o pedido ou com o item no banco.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => {
                setPagina(pagina - 1)
                setCarregando(true)
              }}
            >
              Anterior
            </Button>
            <span>
              Página {pagina} de{" "}
              {Math.max(1, resultado?.paginacao.totalPaginas ?? 1)}
            </span>
            <Button
              variant="outline"
              disabled={pagina >= (resultado?.paginacao.totalPaginas ?? 0)}
              onClick={() => {
                setPagina(pagina + 1)
                setCarregando(true)
              }}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
