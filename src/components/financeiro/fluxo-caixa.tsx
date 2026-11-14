"use client"

import { useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { hoje } from "@/features/erp/datas"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { FluxoCaixaDados } from "@/modules/fluxo-caixa/schema"
import { formatarValorCaixa as brl } from "@/modules/fluxo-caixa/formatacao"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const dataBrasil = (valor: string) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

export function FluxoCaixa() {
  const { estado, usuario, empresa, empresas, selecionarEmpresa } =
    useAutenticacao()
  return (
    <div className="space-y-6">
      {empresas.length > 1 && (
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
      {estado === "carregando" ? (
        <Skeleton className="h-64 w-full" />
      ) : estado === "autenticado" && empresa ? (
        <FluxoEmpresa key={`${usuario?.email}:${empresa.id}`} />
      ) : (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa para consultar o fluxo de
            caixa.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function FluxoEmpresa() {
  const { requisitar } = useAutenticacao()
  const [de, setDe] = useState(() => `${hoje().slice(0, 7)}-01`)
  const [ate, setAte] = useState(hoje)
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const [resultado, setResultado] = useState<{
    chave: string
    dados?: FluxoCaixaDados
    erro?: string
  } | null>(null)
  const valido = Boolean(de && ate && de <= ate)
  const chave = `${de}:${ate}:${pagina}:${revisao}`
  const atual = resultado?.chave === chave ? resultado : null
  const dados = atual?.dados
  useEffect(() => {
    if (!valido) return
    const controller = new AbortController()
    const query = new URLSearchParams({ de, ate, pagina: String(pagina) })
    requisitar(`/api/financeiro/fluxo-caixa?${query}`, {
      signal: controller.signal,
    })
      .then(async (resposta) => {
        const json = await resposta.json()
        if (!resposta.ok)
          throw new Error(json.error ?? "Falha ao consultar o fluxo de caixa.")
        return json.data as FluxoCaixaDados
      })
      .then((dados) => {
        if (!controller.signal.aborted) setResultado({ chave, dados })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setResultado({
            chave,
            erro: e instanceof Error ? e.message : "Falha na consulta.",
          })
      })
    return () => controller.abort()
  }, [de, ate, pagina, revisao, chave, valido, requisitar])
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          De
          <Input
            type="date"
            value={de}
            aria-invalid={!valido}
            onChange={(e) => {
              setDe(e.target.value)
              setPagina(1)
            }}
          />
        </label>
        <label className="space-y-1">
          Até
          <Input
            type="date"
            value={ate}
            aria-invalid={!valido}
            onChange={(e) => {
              setAte(e.target.value)
              setPagina(1)
            }}
          />
        </label>
        <Button variant="outline" onClick={() => setRevisao((r) => r + 1)}>
          Atualizar
        </Button>
      </div>
      {!valido ? (
        <Alert variant="destructive">
          <AlertDescription>
            Preencha as duas datas, com De anterior ou igual a Até.
          </AlertDescription>
        </Alert>
      ) : atual?.erro ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os dados</AlertTitle>
          <AlertDescription>
            {atual.erro}
            <Button variant="outline" onClick={() => setRevisao((r) => r + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : !dados ? (
        <div role="status" aria-label="Carregando fluxo de caixa">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Entradas realizadas", dados.entradas],
                ["Saídas realizadas", dados.saidas],
                ["Saldo do período", dados.saldoPeriodo],
                ["Saldo projetado", dados.saldoProjetado],
              ] as const
            ).map(([titulo, valor]) => (
              <Card key={titulo}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {titulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">
                  {brl(valor)}
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Realizados pela data da movimentação. Projeção até{" "}
            {ate.split("-").reverse().join("/")}: saldo bancário de{" "}
            {brl(dados.saldoDisponivel)} + {brl(dados.aReceber)} a receber −{" "}
            {brl(dados.aPagar)} a pagar. O saldo bancário inclui os saldos
            iniciais e movimentos até a data final, inclusive contas inativas.
            Os títulos usam os saldos pendentes atuais, incluindo vencidos; esta
            consulta não reconstrói a posição histórica dos títulos.
          </p>
          {dados.atrasados.quantidade > 0 && (
            <Alert variant="destructive">
              <AlertTitle>
                {dados.atrasados.quantidade} conta(s) em atraso hoje
              </AlertTitle>
              <AlertDescription>
                A receber: {brl(dados.atrasados.receber)}. A pagar:{" "}
                {brl(dados.atrasados.pagar)}. Considera todos os títulos
                pendentes vencidos da empresa, independentemente do período
                selecionado.
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Movimentações realizadas no período</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data do movimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.movimentos.length ? (
                    dados.movimentos.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.descricao}</TableCell>
                        <TableCell>
                          {r.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                        </TableCell>
                        <TableCell>{dataBrasil(r.data)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {brl(r.valor)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="h-32 text-center">
                        Nenhuma movimentação no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  disabled={dados.pagina <= 1}
                  onClick={() => setPagina(dados.pagina - 1)}
                >
                  Anterior
                </Button>
                <span>
                  Página {dados.pagina} de {Math.max(1, dados.totalPaginas)}
                </span>
                <Button
                  variant="outline"
                  disabled={dados.pagina >= dados.totalPaginas}
                  onClick={() => setPagina(dados.pagina + 1)}
                >
                  Próxima
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
