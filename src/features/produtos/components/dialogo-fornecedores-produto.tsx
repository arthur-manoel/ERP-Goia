"use client"

import { useEffect, useRef, useState } from "react"
import { Pencil, Plus, Truck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao"
import {
  listarFornecedoresProduto,
  opcaoFornecedorProdutoSchema,
  schemaFornecedoresDaEmpresa,
  type OpcaoFornecedorProduto,
} from "../fornecedores-api"
import {
  alteracoesFornecedor,
  condicoesProdutoFornecedorSchema,
  formularioFornecedor,
  type ProdutoFornecedor,
} from "../fornecedores-schema"
import type { Produto } from "../tipos"

function nomeFornecedor(item: ProdutoFornecedor) {
  return item.fornecedores.nome_fantasia || item.fornecedores.razao_social
}

export function DialogoFornecedoresProduto({
  produto,
  idEmpresa,
  aoFechar,
}: {
  produto: Produto
  idEmpresa: number
  aoFechar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [vinculos, setVinculos] = useState<ProdutoFornecedor[]>()
  const [opcoes, setOpcoes] = useState<OpcaoFornecedorProduto[]>()
  const [erroLista, setErroLista] = useState("")
  const [erroOpcoes, setErroOpcoes] = useState("")
  const [erroSalvar, setErroSalvar] = useState("")
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({})
  const [revisao, setRevisao] = useState(0)
  const [editando, setEditando] = useState<ProdutoFornecedor | null>(null)
  const [idFornecedor, setIdFornecedor] = useState("")
  const [dados, setDados] = useState(formularioFornecedor)
  const [ocupado, setOcupado] = useState(false)
  const [confirmacao, setConfirmacao] = useState<ProdutoFornecedor | null>(null)
  const trava = useRef(false)
  const montado = useRef(true)
  const rota = `/api/produtos/${produto.id}/fornecedores`

  useEffect(() => {
    montado.current = true
    return () => {
      montado.current = false
    }
  }, [])

  useEffect(() => {
    const controle = new AbortController()
    const { signal } = controle
    void listarFornecedoresProduto(
      requisitar,
      rota,
      idEmpresa,
      schemaFornecedoresDaEmpresa(idEmpresa, produto.id),
      signal,
    )
      .then((itens) => {
        if (!signal.aborted) setVinculos(itens)
      })
      .catch((causa: unknown) => {
        if (!signal.aborted)
          setErroLista(
            causa instanceof Error
              ? causa.message
              : "Falha ao consultar fornecedores.",
          )
      })
    void listarFornecedoresProduto(
      requisitar,
      `${rota}/opcoes`,
      idEmpresa,
      opcaoFornecedorProdutoSchema,
      signal,
    )
      .then((itens) => {
        if (!signal.aborted) setOpcoes(itens)
      })
      .catch((causa: unknown) => {
        if (!signal.aborted)
          setErroOpcoes(
            causa instanceof Error
              ? causa.message
              : "Falha ao carregar opções de fornecedores.",
          )
      })
    return () => controle.abort()
  }, [idEmpresa, produto.id, requisitar, revisao, rota])

  function recarregar() {
    setVinculos(undefined)
    setOpcoes(undefined)
    setErroLista("")
    setErroOpcoes("")
    setRevisao((valor) => valor + 1)
  }

  function limpar() {
    setEditando(null)
    setIdFornecedor("")
    setDados(formularioFornecedor())
    setErros({})
    setErroSalvar("")
  }

  async function gravar(corpo: object, item?: ProdutoFornecedor) {
    if (trava.current || !vinculos || erroLista) return
    trava.current = true
    setOcupado(true)
    setErroSalvar("")
    try {
      const resposta = await requisitar(item ? `${rota}/${item.id}` : rota, {
        method: item ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Empresa-Id": String(idEmpresa),
        },
        body: JSON.stringify(corpo),
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      if (!montado.current) return
      limpar()
      setConfirmacao(null)
      recarregar()
      toast.success(
        item
          ? "Fornecedor do produto atualizado."
          : "Fornecedor vinculado ao produto.",
      )
    } catch (causa) {
      if (montado.current) {
        setConfirmacao(null)
        setErroSalvar(
          causa instanceof Error
            ? causa.message
            : "Não foi possível salvar o fornecedor.",
        )
      }
    } finally {
      trava.current = false
      if (montado.current) setOcupado(false)
    }
  }

  function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    if (produto.status !== "ATIVO" || editando?.status === "INATIVO") return
    const resultado = condicoesProdutoFornecedorSchema.safeParse(dados)
    const errosCampos = resultado.success
      ? {}
      : resultado.error.flatten().fieldErrors
    if (
      !editando &&
      (!idFornecedor ||
        !opcoes?.some((item) => String(item.id) === idFornecedor))
    ) {
      setErros({
        ...errosCampos,
        id_fornecedor: ["Selecione um fornecedor disponível."],
      })
      return
    }
    if (!resultado.success) {
      setErros(errosCampos)
      return
    }
    if (
      !editando &&
      vinculos?.some((item) => String(item.id_fornecedor) === idFornecedor)
    ) {
      setErros({
        id_fornecedor: [
          "Este fornecedor já tem vínculo. Edite ou reative o registro existente.",
        ],
      })
      return
    }
    setErros({})
    const corpo = editando
      ? alteracoesFornecedor(editando, resultado.data)
      : { id_fornecedor: Number(idFornecedor), ...resultado.data }
    if (!Object.keys(corpo).length) {
      limpar()
      return
    }
    void gravar(corpo, editando ?? undefined)
  }

  const bloqueado =
    ocupado ||
    !vinculos ||
    !!erroLista ||
    produto.status !== "ATIVO" ||
    editando?.status === "INATIVO"
  const disponiveis =
    opcoes?.filter(
      (opcao) => !vinculos?.some((item) => item.id_fornecedor === opcao.id),
    ) ?? []

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !trava.current) aoFechar()
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"
        showCloseButton={!ocupado}
      >
        <DialogHeader>
          <DialogTitle>Fornecedores de {produto.nome}</DialogTitle>
          <DialogDescription>
            Gerencie o código e as condições de fornecimento deste produto na
            empresa selecionada.
          </DialogDescription>
        </DialogHeader>
        {erroLista && (
          <Alert variant="destructive">
            <AlertDescription>{erroLista}</AlertDescription>
          </Alert>
        )}
        {erroOpcoes && (
          <Alert variant="destructive">
            <AlertDescription>
              Não foi possível carregar os fornecedores disponíveis.{" "}
              {erroOpcoes} Os vínculos existentes podem ser editados.
            </AlertDescription>
          </Alert>
        )}
        {(erroLista || erroOpcoes) && (
          <Button variant="outline" disabled={ocupado} onClick={recarregar}>
            Tentar novamente
          </Button>
        )}
        {erroSalvar && (
          <Alert variant="destructive">
            <AlertDescription>{erroSalvar}</AlertDescription>
          </Alert>
        )}
        {produto.status !== "ATIVO" && (
          <p className="text-sm text-muted-foreground">
            Reative o produto para adicionar, editar ou reativar fornecedores.
          </p>
        )}
        <form
          onSubmit={salvar}
          noValidate
          className="space-y-4 rounded-lg border p-4"
        >
          <h3 className="font-medium">
            {editando
              ? `Editar condições de ${nomeFornecedor(editando)}`
              : "Vincular fornecedor"}
          </h3>
          {!editando && (
            <Field data-invalid={!!erros.id_fornecedor}>
              <FieldLabel htmlFor="produto-fornecedor">Fornecedor</FieldLabel>
              <SearchSelect
                id="produto-fornecedor"
                label="Fornecedor"
                value={idFornecedor}
                onValueChange={setIdFornecedor}
                disabled={bloqueado || !opcoes || !!erroOpcoes}
                invalid={!!erros.id_fornecedor}
                describedBy="erro-fornecedor"
                placeholder={
                  !opcoes && !erroOpcoes
                    ? "Carregando fornecedores..."
                    : "Selecione um fornecedor"
                }
                options={disponiveis.map((item) => ({
                  value: String(item.id),
                  label: item.nome,
                }))}
              />
              <FieldError id="erro-fornecedor">
                {erros.id_fornecedor?.[0]}
              </FieldError>
              {opcoes && !erroOpcoes && !disponiveis.length && (
                <p className="text-sm text-muted-foreground">
                  Nenhum fornecedor disponível para novo vínculo. Cadastre ou
                  associe um fornecedor à empresa, ou edite um vínculo abaixo.
                </p>
              )}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  "codigo_produto_fornecedor",
                  "Código no fornecedor",
                  "text",
                  "Ex.: CAM-001",
                ],
                [
                  "preco_ultima_compra",
                  "Último preço de compra (R$)",
                  "decimal",
                  "0,00",
                ],
                [
                  "prazo_entrega_dias",
                  "Prazo de entrega (dias)",
                  "numeric",
                  "Ex.: 7",
                ],
                ["quantidade_minima", "Quantidade mínima", "decimal", "0,000"],
              ] as const
            ).map(([campo, titulo, modo, placeholder]) => (
              <Field key={campo} data-invalid={!!erros[campo]}>
                <FieldLabel htmlFor={campo}>{titulo}</FieldLabel>
                <Input
                  id={campo}
                  value={dados[campo]}
                  inputMode={modo}
                  placeholder={placeholder}
                  maxLength={campo === "codigo_produto_fornecedor" ? 100 : 32}
                  disabled={bloqueado}
                  aria-invalid={!!erros[campo]}
                  aria-describedby={`${campo}-erro`}
                  onChange={(evento) =>
                    setDados((atual) => ({
                      ...atual,
                      [campo]: evento.target.value,
                    }))
                  }
                />
                <FieldError id={`${campo}-erro`}>
                  {erros[campo]?.[0]}
                </FieldError>
              </Field>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="fornecedor-principal"
              checked={dados.fornecedor_principal}
              disabled={bloqueado}
              onCheckedChange={(valor) =>
                setDados((atual) => ({
                  ...atual,
                  fornecedor_principal: valor === true,
                }))
              }
            />
            <FieldLabel htmlFor="fornecedor-principal">
              Fornecedor principal
            </FieldLabel>
          </div>
          <p className="text-xs text-muted-foreground">
            Campos de condições são opcionais. Deixe em branco para não
            informar; zero indica valor ou prazo zero. Ao definir um principal,
            o vínculo anterior deixa de ser principal.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                bloqueado ||
                (!editando && (!opcoes || !!erroOpcoes || !disponiveis.length))
              }
            >
              {ocupado
                ? "Salvando..."
                : editando
                  ? "Salvar condições"
                  : "Vincular fornecedor"}
            </Button>
            {editando && (
              <Button
                type="button"
                variant="outline"
                disabled={ocupado}
                onClick={limpar}
              >
                <Plus />
                Novo vínculo
              </Button>
            )}
          </div>
        </form>
        {!vinculos ? (
          !erroLista && <Skeleton className="h-32 w-full" />
        ) : !vinculos.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Truck />
              </EmptyMedia>
              <EmptyTitle>Nenhum fornecedor vinculado</EmptyTitle>
              <EmptyDescription>
                Selecione um fornecedor e informe as condições acima.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div
            className="overflow-x-auto rounded-lg border"
            role="region"
            aria-label="Fornecedores vinculados"
            tabIndex={0}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor / Código</TableHead>
                  <TableHead>Último preço</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vinculos.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium">{nomeFornecedor(item)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.codigo_produto_fornecedor ??
                          "Código não informado"}
                      </p>
                      {item.fornecedor_principal && <Badge>Principal</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.preco_ultima_compra === null
                        ? "Não informado"
                        : formatarMoeda(item.preco_ultima_compra)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.prazo_entrega_dias === null
                        ? "Não informado"
                        : `${item.prazo_entrega_dias} dias`}
                    </TableCell>
                    <TableCell>
                      {item.quantidade_minima === null
                        ? "Não informada"
                        : formatarQuantidade(item.quantidade_minima)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          item.status === "ATIVO" ? "outline" : "secondary"
                        }
                      >
                        {item.status === "ATIVO" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Editar condições de ${nomeFornecedor(item)}`}
                          disabled={
                            ocupado ||
                            item.status !== "ATIVO" ||
                            produto.status !== "ATIVO"
                          }
                          onClick={() => {
                            limpar()
                            setEditando(item)
                            setDados(formularioFornecedor(item))
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            ocupado ||
                            (item.status === "INATIVO" &&
                              produto.status !== "ATIVO")
                          }
                          onClick={() => setConfirmacao(item)}
                        >
                          {item.status === "ATIVO" ? "Inativar" : "Reativar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
        <AlertDialog
          open={!!confirmacao}
          onOpenChange={(aberto) => {
            if (!aberto && !trava.current) setConfirmacao(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmacao?.status === "ATIVO"
                  ? "Inativar fornecedor do produto?"
                  : "Reativar fornecedor do produto?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmacao && nomeFornecedor(confirmacao)}: a alteração afeta
                somente o vínculo com este produto na empresa atual. O histórico
                será preservado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={ocupado}
                onClick={(evento) => {
                  evento.preventDefault()
                  if (confirmacao)
                    void gravar(
                      {
                        status:
                          confirmacao.status === "ATIVO" ? "INATIVO" : "ATIVO",
                      },
                      confirmacao,
                    )
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
