"use client"

import { useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { hoje } from "@/features/erp/datas"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { ResultadoDados } from "@/modules/resultado/calculo"
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

export function RelatorioResultado() {
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
        <ResultadoEmpresa key={`${usuario?.email}:${empresa.id}`} />
      ) : (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa para consultar o
            resultado.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

function ResultadoEmpresa() {
  const { requisitar } = useAutenticacao()
  const [de, setDe] = useState(() => `${hoje().slice(0, 7)}-01`)
  const [ate, setAte] = useState(hoje)
  const [revisao, setRevisao] = useState(0)
  const [resultado, setResultado] = useState<{
    chave: string
    dados?: ResultadoDados
    erro?: string
  } | null>(null)
  const valido = Boolean(de && ate && de <= ate)
  const chave = `${de}:${ate}:${revisao}`
  const atual = resultado?.chave === chave ? resultado : null
  useEffect(() => {
    if (!valido) return
    const controller = new AbortController()
    requisitar(
      `/api/financeiro/resultado?${new URLSearchParams({ de, ate })}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok)
          throw new Error(json.error ?? "Falha ao consultar o resultado.")
        if (!controller.signal.aborted)
          setResultado({ chave, dados: json.data as ResultadoDados })
      })
      .catch((erro: unknown) => {
        if (!controller.signal.aborted)
          setResultado({
            chave,
            erro: erro instanceof Error ? erro.message : "Falha na consulta.",
          })
      })
    return () => controller.abort()
  }, [de, ate, chave, valido, requisitar])
  const dados = atual?.dados
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="date"
          aria-label="De"
          value={de}
          onChange={(e) => setDe(e.target.value)}
          className="w-[160px]"
        />
        <span>até</span>
        <Input
          type="date"
          aria-label="Até"
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          className="w-[160px]"
        />
        <Button variant="outline" onClick={() => setRevisao((r) => r + 1)}>
          Atualizar
        </Button>
      </div>
      <Alert>
        <AlertTitle>Critério do relatório</AlertTitle>
        <AlertDescription>
          Receitas são os títulos a receber; custos são os títulos de compras a
          pagar, ambos pelo vencimento e valor final, incluindo títulos em
          aberto. Créditos de cancelamento são descontados da receita no período
          do título original, incluindo valores a restituir. Despesas sem
          vínculo são apuradas pela data da despesa. Despesas vinculadas a
          títulos já integram os custos de compras e não são somadas novamente.
          Cancelados são excluídos. Margem = receita − custos − despesas. Este
          resultado por vencimento não representa o lucro contábil por
          competência nem o fluxo de caixa.
        </AlertDescription>
      </Alert>
      {!valido ? (
        <Alert variant="destructive">
          <AlertDescription>
            Informe um período válido, com início anterior ou igual ao fim.
          </AlertDescription>
        </Alert>
      ) : atual?.erro ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar o resultado</AlertTitle>
          <AlertDescription>{atual.erro}</AlertDescription>
        </Alert>
      ) : !dados ? (
        <Skeleton aria-label="Carregando resultado" className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["Receita", dados.receita],
                ["Custos de compras", dados.custo],
                ["Despesas", dados.despesa],
                ["Margem apurada", dados.margem],
              ] as const
            ).map(([titulo, valor]) => (
              <Card key={titulo}>
                <CardHeader>
                  <CardTitle className="text-sm">{titulo}</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold tabular-nums">
                  {brl(valor)}
                  {titulo === "Margem apurada" && (
                    <p className="text-sm text-muted-foreground">
                      {dados.percentual === null
                        ? "Sem receita para calcular percentual"
                        : `${dados.percentual}% da receita`}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Resultado por categoria no período</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Classificação</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.grupos.length ? (
                    dados.grupos.map((g) => (
                      <TableRow key={`${g.tipo}:${g.categoria}`}>
                        <TableCell>{g.tipo}</TableCell>
                        <TableCell>{g.categoria}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {brl(g.valor)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-32 text-center">
                        Nenhum lançamento no período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
