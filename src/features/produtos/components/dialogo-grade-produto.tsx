"use client"

import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { listarCatalogoProduto, type OpcaoCatalogo } from "../api"
import type { Produto } from "../tipos"

const id = z.number().int().positive()
const variacaoSchema = z.object({
  id,
  id_cor: id.nullable(),
  id_tamanho: id.nullable(),
  status: z.enum(["ATIVO", "INATIVO"]),
})
type Variacao = z.infer<typeof variacaoSchema>
type Combinacao = Pick<Variacao, "id_cor" | "id_tamanho">

export function DialogoGradeProduto({
  produto,
  idEmpresa,
  aoFechar,
}: {
  produto: Produto
  idEmpresa: number
  aoFechar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [catalogos, setCatalogos] = useState<{
    cores: OpcaoCatalogo[]
    tamanhos: OpcaoCatalogo[]
  }>()
  const [variacoes, setVariacoes] = useState<Variacao[]>()
  const [cores, setCores] = useState<number[]>([])
  const [tamanhos, setTamanhos] = useState<number[]>([])
  const [erro, setErro] = useState("")
  const [erroGrade, setErroGrade] = useState("")
  const [revisao, setRevisao] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const rota = `/api/produtos/${produto.id}/variacoes`

  useEffect(() => {
    const controle = new AbortController()
    const { signal } = controle
    void Promise.all([
      listarCatalogoProduto(requisitar, "/api/cores", idEmpresa, signal),
      listarCatalogoProduto(requisitar, "/api/tamanhos", idEmpresa, signal),
    ])
      .then(([cores, tamanhos]) => {
        if (!signal.aborted) setCatalogos({ cores, tamanhos })
      })
      .catch((causa: unknown) => {
        if (!signal.aborted)
          setErro(
            causa instanceof Error
              ? causa.message
              : "Falha ao carregar os cadastros.",
          )
      })
    async function carregarGrade() {
      const linhas: Variacao[] = []
      let paginas = 1
      for (let page = 1; page <= paginas; page++) {
        const resposta = await requisitar(`${rota}?page=${page}&limit=100`, {
          signal,
          headers: { "X-Empresa-Id": String(idEmpresa) },
        })
        if (!resposta.ok)
          throw new Error(
            resposta.status === 404
              ? "A consulta da grade está indisponível. Tente novamente mais tarde."
              : await mensagemErro(resposta),
          )
        const resultado = z
          .object({
            data: z.object({
              rows: z.array(variacaoSchema),
              totalPages: z.number().int().nonnegative(),
            }),
          })
          .safeParse(await resposta.json())
        if (!resultado.success) throw new Error("Resposta da grade inválida.")
        const corpo = resultado.data
        linhas.push(...corpo.data.rows)
        paginas = corpo.data.totalPages
      }
      if (!signal.aborted) setVariacoes(linhas)
    }
    void carregarGrade().catch((causa: unknown) => {
      if (!signal.aborted)
        setErroGrade(
          causa instanceof Error
            ? causa.message
            : "Falha ao consultar a grade.",
        )
    })
    return () => controle.abort()
  }, [idEmpresa, requisitar, revisao, rota])

  const corAtiva =
    catalogos?.cores.filter((item) => item.status === "ATIVA") ?? []
  const tamanhoAtivo =
    catalogos?.tamanhos.filter((item) => item.status === "ATIVO") ?? []
  const coresSelecionadas = cores.filter((valor) =>
    corAtiva.some((item) => item.id === valor),
  )
  const tamanhosSelecionados = tamanhos.filter((valor) =>
    tamanhoAtivo.some((item) => item.id === valor),
  )
  const combinacoes: Combinacao[] = []
  if (coresSelecionadas.length || tamanhosSelecionados.length) {
    for (const id_cor of coresSelecionadas.length
      ? coresSelecionadas
      : [null]) {
      for (const id_tamanho of tamanhosSelecionados.length
        ? tamanhosSelecionados
        : [null]) {
        combinacoes.push({ id_cor, id_tamanho })
      }
    }
  }
  const novas = combinacoes.filter(
    (item) =>
      !variacoes?.some(
        (atual) =>
          atual.id_cor === item.id_cor && atual.id_tamanho === item.id_tamanho,
      ),
  )
  function dimensoes(item: Combinacao) {
    return [
      item.id_cor
        ? (catalogos?.cores.find(({ id }) => id === item.id_cor)?.nome ??
          `Cor #${item.id_cor}`)
        : "Sem cor",
      item.id_tamanho
        ? (catalogos?.tamanhos.find(({ id }) => id === item.id_tamanho)?.nome ??
          `Tamanho #${item.id_tamanho}`)
        : "Sem tamanho",
    ].join(" / ")
  }
  function selecionar(
    valor: number,
    marcado: boolean,
    atuais: number[],
    alterar: (itens: number[]) => void,
  ) {
    alterar(
      marcado ? [...atuais, valor] : atuais.filter((item) => item !== valor),
    )
  }
  async function salvar(dados: object, idVariacao?: number) {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      const resposta = await requisitar(
        idVariacao ? `${rota}/${idVariacao}` : rota,
        {
          method: idVariacao ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Empresa-Id": String(idEmpresa),
          },
          body: JSON.stringify(dados),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      setCores([])
      setTamanhos([])
      setVariacoes(undefined)
      setErroGrade("")
      setRevisao((atual) => atual + 1)
      toast.success(
        idVariacao
          ? "Situação da variação atualizada."
          : "Variações vinculadas ao produto.",
      )
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível salvar a grade.",
      )
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !ocupado) aoFechar()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Grade de {produto.nome}</DialogTitle>
          <DialogDescription>
            Selecione cores e tamanhos para gerar as combinações. Você também
            pode usar apenas uma dessas dimensões.
          </DialogDescription>
        </DialogHeader>
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {erroGrade && (
          <Alert variant="destructive">
            <AlertDescription>{erroGrade}</AlertDescription>
          </Alert>
        )}
        {(erro || erroGrade) && (
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() => {
              setErro("")
              setErroGrade("")
              setRevisao((atual) => atual + 1)
            }}
          >
            Tentar novamente
          </Button>
        )}
        {!catalogos ? (
          !erro && <Skeleton className="h-32 w-full" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["Cores", corAtiva, cores, setCores],
                  ["Tamanhos", tamanhoAtivo, tamanhos, setTamanhos],
                ] as const
              ).map(([titulo, opcoes, selecao, alterar]) => (
                <fieldset
                  key={titulo}
                  disabled={ocupado || produto.status !== "ATIVO"}
                  className="space-y-2 rounded-md border p-3"
                >
                  <legend className="px-1 text-sm font-medium">{titulo}</legend>
                  {!opcoes.length && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum cadastro ativo.
                    </p>
                  )}
                  {opcoes.map((opcao) => (
                    <label
                      key={opcao.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selecao.includes(opcao.id)}
                        onChange={(evento) =>
                          selecionar(
                            opcao.id,
                            evento.target.checked,
                            selecao,
                            alterar,
                          )
                        }
                      />
                      {opcao.nome}
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {produto.status !== "ATIVO" && (
              <p className="text-sm">
                Reative o produto para adicionar combinações ou reativar
                variações.
              </p>
            )}
            {!!combinacoes.length && (
              <section className="space-y-2" aria-label="Prévia da grade">
                <p className="text-sm">
                  {combinacoes.length} combinações selecionadas · {novas.length}{" "}
                  novas
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border p-3">
                  {combinacoes.slice(0, 200).map((item) => (
                    <p
                      key={`${item.id_cor}:${item.id_tamanho}`}
                      className="text-sm"
                    >
                      {dimensoes(item)}
                      {variacoes?.some(
                        (atual) =>
                          atual.id_cor === item.id_cor &&
                          atual.id_tamanho === item.id_tamanho,
                      )
                        ? " (já cadastrada)"
                        : ""}
                    </p>
                  ))}
                </div>
              </section>
            )}
            <Button
              disabled={
                ocupado ||
                !variacoes ||
                !!erroGrade ||
                !novas.length ||
                novas.length > 200 ||
                produto.status !== "ATIVO"
              }
              onClick={() => void salvar({ variacoes: novas })}
            >
              Vincular combinações
            </Button>
            {novas.length > 200 && (
              <p role="alert">Selecione até 200 combinações novas por vez.</p>
            )}
            {variacoes ? (
              variacoes.length ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variação</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variacoes.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{dimensoes(item)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {item.status === "ATIVO" ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              disabled={
                                ocupado ||
                                !!erroGrade ||
                                (item.status === "INATIVO" &&
                                  produto.status !== "ATIVO")
                              }
                              onClick={() =>
                                void salvar(
                                  {
                                    status:
                                      item.status === "ATIVO"
                                        ? "INATIVO"
                                        : "ATIVO",
                                  },
                                  item.id,
                                )
                              }
                            >
                              {item.status === "ATIVO"
                                ? "Inativar"
                                : "Reativar"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Este produto ainda está sem variações cadastradas.
                </p>
              )
            ) : (
              !erroGrade && <Skeleton className="h-24 w-full" />
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={ocupado}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
