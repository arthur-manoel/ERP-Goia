"use client"

import { useCallback, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarData, formatarMoeda } from "@/lib/formatacao"
import { consultarCliente, historicoCliente } from "../api"
import { useConsultaCliente } from "../use-consulta"

export function DetalhesClienteApi({
  idCliente,
  idEmpresa,
  aoFechar,
}: {
  idCliente: number
  idEmpresa: number
  aoFechar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [revisao, setRevisao] = useState(0)
  const consultar = useCallback(
    (signal: AbortSignal) =>
      consultarCliente(requisitar, idEmpresa, idCliente, signal),
    [requisitar, idEmpresa, idCliente],
  )
  const consulta = useConsultaCliente(String(revisao), consultar)
  const cliente = consulta.dados
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {cliente?.nome_razao_social ?? "Detalhes do cliente"}
          </DialogTitle>
          <DialogDescription>
            Dados cadastrais e histórico comercial.
          </DialogDescription>
        </DialogHeader>
        {consulta.carregando ? (
          <Skeleton
            className="h-64 w-full"
            aria-label="Carregando detalhes do cliente"
          />
        ) : consulta.erro ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{consulta.erro}</p>
              <Button
                variant="outline"
                onClick={() => setRevisao((v) => v + 1)}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          cliente && (
            <>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {[
                  ["CPF / CNPJ", cliente.cpf_cnpj],
                  [
                    "Situação",
                    cliente.status === "ATIVO" ? "Ativo" : "Inativo",
                  ],
                  ["E-mail", cliente.email],
                  ["Telefone", cliente.telefone],
                  [
                    "Endereço",
                    [
                      cliente.endereco,
                      cliente.numero,
                      cliente.complemento,
                      cliente.bairro,
                      cliente.cidade,
                      cliente.estado,
                      cliente.cep,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  ],
                  ["Cadastro", formatarData(new Date(cliente.data_cadastro))],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="min-w-0">
                    <dt className="text-muted-foreground">{rotulo}</dt>
                    <dd className="mt-1 break-words">
                      {valor || "Não informado"}
                    </dd>
                  </div>
                ))}
              </dl>
              <HistoricoClienteApi
                idCliente={idCliente}
                idEmpresa={idEmpresa}
              />
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoricoClienteApi({
  idCliente,
  idEmpresa,
}: {
  idCliente: number
  idEmpresa: number
}) {
  const { requisitar } = useAutenticacao()
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const consultar = useCallback(
    (signal: AbortSignal) =>
      historicoCliente(requisitar, idEmpresa, idCliente, pagina, signal),
    [requisitar, idEmpresa, idCliente, pagina],
  )
  const consulta = useConsultaCliente(`${pagina}:${revisao}`, consultar)
  const dados = consulta.dados
  return (
    <section className="space-y-3" aria-label="Histórico de vendas">
      <div>
        <h3 className="font-medium">Histórico de vendas</h3>
        <p className="text-sm text-muted-foreground">
          Vendas vinculadas ao cliente nesta empresa.
        </p>
      </div>
      {consulta.carregando ? (
        <Skeleton className="h-32 w-full" aria-label="Carregando histórico" />
      ) : consulta.erro ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{consulta.erro}</p>
            <Button variant="outline" onClick={() => setRevisao((v) => v + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        dados && (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venda</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.pedidos.map((pedido) => (
                    <TableRow key={pedido.id}>
                      <TableCell>{pedido.numero}</TableCell>
                      <TableCell>
                        {formatarData(new Date(pedido.data_venda))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {pedido.status.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(pedido.valor_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!dados.pedidos.length && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Nenhuma venda registrada para este cliente.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {dados.paginacao.total}{" "}
                {dados.paginacao.total === 1 ? "venda" : "vendas"} · Página{" "}
                {pagina} de {Math.max(1, dados.paginacao.totalPaginas)}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Página anterior do histórico"
                  disabled={pagina <= 1}
                  onClick={() => setPagina(pagina - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Próxima página do histórico"
                  disabled={pagina >= dados.paginacao.totalPaginas}
                  onClick={() => setPagina(pagina + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        )
      )}
    </section>
  )
}
