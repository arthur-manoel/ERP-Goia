"use client"

import { useState } from "react"
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Path,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Package,
  Plus,
  Trash2,
  Truck,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { useErp } from "@/features/erp/components/provedor"
import {
  SearchSelect,
  type Option,
} from "@/features/erp/components/seletor-pesquisavel"
import { hoje, rotuloData } from "@/features/erp/datas"
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao"
import { consultarDisponibilidade } from "../disponibilidade"
import { pedidoSchema, totalPedido, type Pedido } from "../schemas"

type Valores = Omit<Pedido, "id">
const novoItem = () => ({
  productId: "",
  variationId: "",
  quantity: 1,
  price: 0,
})
const quantidade = (valor: number) => formatarQuantidade(valor, 0)

export function FormularioPedido({
  initial,
  onClose,
  returnFocus,
}: {
  initial: Partial<Pedido>
  onClose: () => void
  returnFocus: () => void
}) {
  const { data, save } = useErp()
  const [tamanhos, definirTamanhos] = useState<Record<string, string>>({})
  const form = useForm<Valores>({
    resolver: zodResolver(pedidoSchema),
    defaultValues: {
      code: initial.code ?? "",
      clientId: initial.clientId ?? "",
      date: initial.date ?? hoje(),
      dueDate: initial.dueDate ?? "",
      status: initial.status ?? "Recebido",
      items: initial.items?.map((item) => ({
        ...item,
        variationId: item.variationId ?? "",
      })) ?? [novoItem()],
    },
  })
  const itens = useFieldArray({ control: form.control, name: "items" })
  const valores = useWatch({ control: form.control })
  const salvando = form.formState.isSubmitting
  if (!data) return null
  const produtos = data.materials.filter(
    (produto) => produto.category === "Produto pronto",
  )
  const clientes = data.clients.filter(
    (cliente) => cliente.role !== "Fornecedor",
  )
  const itensAtuais = (valores.items ?? []) as Valores["items"]
  const itensCalculaveis = itensAtuais.filter(
    (item) =>
      Number.isFinite(item.quantity) &&
      Number.isFinite(item.price) &&
      item.quantity > 0 &&
      item.price >= 0,
  )
  const total = totalPedido({ items: itensCalculaveis })
  const pecas = itensCalculaveis.reduce((soma, item) => soma + item.quantity, 0)
  const verificacoes = itensAtuais.map((item) =>
    consultarDisponibilidade(data, item, valores.dueDate ?? "", initial.id),
  )
  const pendencias = verificacoes.filter(
    (item) => item?.situacao === "insuficiente",
  ).length

  async function salvar(valores: Valores) {
    let invalido = false
    valores.items.forEach((item, index) => {
      const produto = produtos.find((produto) => produto.id === item.productId)
      if (produto?.variations?.length && !item.variationId) {
        form.setError(
          `items.${index}.variationId`,
          { message: "Selecione o tamanho e a cor." },
          { shouldFocus: !invalido },
        )
        invalido = true
      }
    })
    if (invalido) return
    try {
      await save("orders", valores, initial.id)
      toast.success(initial.id ? "Pedido atualizado." : "Pedido cadastrado.")
      onClose()
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar o pedido."
      form.setError("root.server", { message: mensagem })
      toast.error(mensagem)
    }
  }

  function campo(
    nome: Path<Valores>,
    rotulo: string,
    configuracao: {
      tipo?: "number" | "date"
      opcoes?: Option[]
      aoAlterar?: (valor: string) => void
      min?: number | string
      step?: number
    } = {},
  ) {
    const erro = form.getFieldState(nome, form.formState).error
    const id = `pedido-${nome.replaceAll(".", "-")}`
    return (
      <Field data-invalid={!!erro}>
        <FieldLabel htmlFor={id}>{rotulo} *</FieldLabel>
        {configuracao.opcoes ? (
          <Controller
            control={form.control}
            name={nome}
            render={({ field }) => (
              <SearchSelect
                id={id}
                ref={field.ref}
                value={String(field.value ?? "")}
                options={configuracao.opcoes ?? []}
                onValueChange={(valor) => {
                  field.onChange(valor)
                  configuracao.aoAlterar?.(valor)
                }}
                onBlur={field.onBlur}
                invalid={!!erro}
                describedBy={erro ? `${id}-erro` : undefined}
                disabled={salvando}
              />
            )}
          />
        ) : (
          <Input
            id={id}
            type={configuracao.tipo ?? "text"}
            min={configuracao.min}
            step={configuracao.step}
            aria-invalid={!!erro}
            aria-describedby={erro ? `${id}-erro` : undefined}
            {...form.register(nome, {
              valueAsNumber: configuracao.tipo === "number",
            })}
          />
        )}
        {erro && <FieldError id={`${id}-erro`}>{erro.message}</FieldError>}
      </Field>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2.5">
                <ClipboardList className="size-5" />
              </div>
              <div className="space-y-1.5">
                <DialogTitle className="text-xl">
                  {initial.id ? "Editar pedido" : "Novo pedido"}
                </DialogTitle>
                <DialogDescription>
                  Monte os itens e confira a disponibilidade para a entrega.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar pedido"
              disabled={salvando}
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit(salvar)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
            <fieldset
              disabled={salvando}
              className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_260px]"
            >
              <div className="min-w-0 space-y-6">
                <section aria-labelledby="dados-pedido" className="space-y-4">
                  <div>
                    <h2 id="dados-pedido" className="font-semibold">
                      Dados do pedido
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Campos com * são obrigatórios.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {campo("clientId", "Cliente", {
                      opcoes: clientes.map((cliente) => ({
                        value: cliente.id,
                        label: `${cliente.name}${cliente.status === "Inativo" ? " (inativo)" : ""}`,
                        disabled:
                          cliente.status !== "Ativo" &&
                          cliente.id !== initial.clientId,
                      })),
                    })}
                    {campo("code", "Código do pedido")}
                    {campo("date", "Data do pedido", { tipo: "date" })}
                    {campo("dueDate", "Previsão de entrega", {
                      tipo: "date",
                      min: valores.date,
                    })}
                    {campo("status", "Situação", {
                      opcoes: pedidoSchema.shape.status.options.map(
                        (status) => ({ value: status, label: status }),
                      ),
                    })}
                  </div>
                  {!clientes.some(
                    (cliente) =>
                      cliente.status === "Ativo" ||
                      cliente.id === initial.clientId,
                  ) && (
                    <Alert>
                      <AlertTitle>Cadastre um cliente</AlertTitle>
                      <AlertDescription>
                        Adicione um cliente ativo em Cadastros → Clientes para
                        montar o pedido.
                      </AlertDescription>
                    </Alert>
                  )}
                </section>
                <section aria-labelledby="itens-pedido" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 id="itens-pedido" className="font-semibold">
                        Itens do pedido
                      </h2>
                      <Badge variant="secondary">{itens.fields.length}</Badge>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={salvando || !produtos.length}
                      onClick={() =>
                        itens.append(novoItem(), {
                          focusName: `items.${itens.fields.length}.productId`,
                        })
                      }
                    >
                      <Plus />
                      Adicionar item
                    </Button>
                  </div>
                  {!produtos.length && (
                    <Alert>
                      <Package />
                      <AlertTitle>Nenhum produto pronto cadastrado</AlertTitle>
                      <AlertDescription>
                        Cadastre produtos prontos no estoque. Os preços,
                        tamanhos e cores aparecerão aqui.
                      </AlertDescription>
                    </Alert>
                  )}
                  {!itens.fields.length && (
                    <Empty className="border border-dashed">
                      <EmptyHeader>
                        <EmptyTitle>Adicione o primeiro item</EmptyTitle>
                        <EmptyDescription>
                          Escolha um produto para começar a montar o pedido.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                  {itens.fields.map((item, index) => {
                    const atual = itensAtuais[index]
                    const produto = produtos.find(
                      (produto) => produto.id === atual?.productId,
                    )
                    const variacoes = produto?.variations ?? []
                    const variacao = variacoes.find(
                      (variacao) => variacao.id === atual?.variationId,
                    )
                    const tamanho = variacao?.size ?? tamanhos[item.id] ?? ""
                    const erro =
                      form.formState.errors.items?.[index]?.variationId
                    const disponibilidade = verificacoes[index]
                    const subtotal =
                      atual &&
                      Number.isFinite(atual.quantity) &&
                      Number.isFinite(atual.price) &&
                      atual.quantity > 0 &&
                      atual.price >= 0
                        ? totalPedido({ items: [atual] })
                        : 0
                    return (
                      <div
                        key={item.id}
                        className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            ITEM {String(index + 1).padStart(2, "0")}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remover item ${index + 1}`}
                            onClick={() => itens.remove(index)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        {campo(`items.${index}.productId`, "Produto", {
                          opcoes: produtos.map((produto) => ({
                            value: produto.id,
                            label: `${produto.name} · ${produto.code}`,
                          })),
                          aoAlterar: (id) => {
                            const escolhido = produtos.find(
                              (produto) => produto.id === id,
                            )
                            form.setValue(
                              `items.${index}.price`,
                              escolhido?.salePrice ?? 0,
                              { shouldDirty: true },
                            )
                            form.setValue(`items.${index}.variationId`, "", {
                              shouldDirty: true,
                            })
                            definirTamanhos((anteriores) => ({
                              ...anteriores,
                              [item.id]: "",
                            }))
                            form.clearErrors(`items.${index}.variationId`)
                          },
                        })}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field data-invalid={!!erro}>
                            <FieldLabel htmlFor={`tamanho-${item.id}`}>
                              Tamanho{variacoes.length ? " *" : ""}
                            </FieldLabel>
                            <SearchSelect
                              id={`tamanho-${item.id}`}
                              value={tamanho}
                              disabled={salvando || !variacoes.length}
                              placeholder={
                                !produto
                                  ? "Selecione um produto"
                                  : !variacoes.length
                                    ? "Sem variações cadastradas"
                                    : "Digite para buscar..."
                              }
                              options={[
                                ...new Set(
                                  variacoes.map((variacao) => variacao.size),
                                ),
                              ].map((size) => ({ value: size, label: size }))}
                              invalid={!!erro}
                              describedBy={
                                erro ? `variacao-${item.id}-erro` : undefined
                              }
                              onValueChange={(size) => {
                                definirTamanhos((anteriores) => ({
                                  ...anteriores,
                                  [item.id]: size,
                                }))
                                form.setValue(
                                  `items.${index}.variationId`,
                                  "",
                                  { shouldDirty: true },
                                )
                              }}
                            />
                          </Field>
                          <Field data-invalid={!!erro}>
                            <FieldLabel htmlFor={`cor-${item.id}`}>
                              Cor{variacoes.length ? " *" : ""}
                            </FieldLabel>
                            <Controller
                              control={form.control}
                              name={`items.${index}.variationId`}
                              render={({ field }) => (
                                <SearchSelect
                                  id={`cor-${item.id}`}
                                  ref={field.ref}
                                  value={field.value ?? ""}
                                  onValueChange={field.onChange}
                                  onBlur={field.onBlur}
                                  disabled={
                                    salvando || !variacoes.length || !tamanho
                                  }
                                  invalid={!!erro}
                                  describedBy={
                                    erro
                                      ? `variacao-${item.id}-erro`
                                      : undefined
                                  }
                                  placeholder={
                                    !variacoes.length
                                      ? "Sem variações cadastradas"
                                      : !tamanho
                                        ? "Selecione o tamanho"
                                        : "Digite para buscar..."
                                  }
                                  options={variacoes
                                    .filter(
                                      (variacao) => variacao.size === tamanho,
                                    )
                                    .map((variacao) => ({
                                      value: variacao.id,
                                      label: variacao.color,
                                    }))}
                                />
                              )}
                            />
                            {erro && (
                              <FieldError id={`variacao-${item.id}-erro`}>
                                {erro.message}
                              </FieldError>
                            )}
                          </Field>
                          {campo(`items.${index}.quantity`, "Quantidade", {
                            tipo: "number",
                            min: 1,
                            step: 1,
                          })}
                          {campo(
                            `items.${index}.price`,
                            "Preço unitário (R$)",
                            { tipo: "number", min: 0.01, step: 0.01 },
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                          <div
                            className="min-w-0 space-y-1 text-xs"
                            role="status"
                          >
                            {disponibilidade ? (
                              <>
                                <Badge
                                  variant={
                                    disponibilidade.situacao === "insuficiente"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                >
                                  {disponibilidade.situacao === "estoque" ? (
                                    <Check />
                                  ) : disponibilidade.situacao ===
                                    "producao" ? (
                                    <Truck />
                                  ) : (
                                    <AlertTriangle />
                                  )}
                                  {disponibilidade.situacao === "estoque"
                                    ? "Disponível em estoque"
                                    : disponibilidade.situacao === "producao"
                                      ? "Produção cobre o prazo"
                                      : "Sem cobertura no prazo"}
                                </Badge>
                                <p className="text-muted-foreground">
                                  Estoque livre:{" "}
                                  {quantidade(disponibilidade.estoque)} ·
                                  Produção no prazo:{" "}
                                  {quantidade(disponibilidade.producao)}
                                </p>
                                {disponibilidade.faltante > 0 && (
                                  <p className="text-destructive">
                                    Faltam{" "}
                                    {quantidade(disponibilidade.faltante)}{" "}
                                    unidade(s) para atender este item.
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="text-muted-foreground">
                                Complete o produto, a variação, a quantidade e a
                                entrega para consultar.
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Subtotal
                            </p>
                            <p className="font-semibold tabular-nums">
                              {formatarMoeda(subtotal)}
                            </p>
                          </div>
                        </div>
                        {form.formState.errors.items?.[index]?.productId && (
                          <p className="sr-only" role="alert">
                            Revise o produto do item {index + 1}.
                          </p>
                        )}
                      </div>
                    )
                  })}
                  {form.formState.errors.items && (
                    <FieldError>
                      Revise os itens: adicione ao menos um produto, evite
                      repetir a mesma variação e informe quantidades inteiras e
                      preços positivos.
                    </FieldError>
                  )}
                </section>
              </div>
              <aside
                aria-label="Resumo do pedido"
                className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Resumo do pedido</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Itens</dt>
                        <dd className="tabular-nums">{itens.fields.length}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          Quantidade total
                        </dt>
                        <dd className="tabular-nums">{quantidade(pecas)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          Entrega prevista
                        </dt>
                        <dd>
                          {valores.dueDate
                            ? rotuloData(valores.dueDate)
                            : "A definir"}
                        </dd>
                      </div>
                    </dl>
                    <div
                      className="border-t pt-4"
                      role="status"
                      aria-live="polite"
                    >
                      <p className="text-sm text-muted-foreground">
                        Total do pedido
                      </p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                        {formatarMoeda(total)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Soma dos itens, sem frete ou descontos.
                    </p>
                  </CardContent>
                </Card>
                {pendencias > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Revise o prazo de entrega</AlertTitle>
                    <AlertDescription>
                      {pendencias} item(ns) sem estoque ou produção suficiente
                      até a entrega. Ajuste a quantidade, o prazo ou planeje a
                      produção. Você ainda pode salvar o pedido.
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Disponibilidade estimada após descontar outros pedidos
                  abertos. Somente ordens planejadas ou em produção com
                  conclusão até a entrega são consideradas. Salvar não reserva
                  estoque.
                </p>
              </aside>
            </fieldset>
            {form.formState.errors.root?.server && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Não foi possível salvar</AlertTitle>
                <AlertDescription>
                  {form.formState.errors.root.server.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter className="m-0 shrink-0 rounded-none px-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando
                ? "Salvando…"
                : initial.id
                  ? "Salvar alterações"
                  : "Salvar pedido"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
