"use client"

import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, Check, Factory, Package, X } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useErp } from "@/features/erp/components/provedor"
import {
  SearchSelect,
  type Option,
} from "@/features/erp/components/seletor-pesquisavel"
import { hoje, rotuloData } from "@/features/erp/datas"
import type { Material } from "@/features/estoque/schemas"
import { formatarQuantidade } from "@/lib/formatacao"
import { calcularDisponibilidadeInsumos } from "../insumos"
import { responsaveisDisponiveis } from "../responsaveis"
import {
  ordemProducaoSchema,
  type ItemOrdemProducao,
  type OrdemProducao,
} from "../schemas"

type Valores = Omit<OrdemProducao, "id">
const quantidade = (valor: number) => formatarQuantidade(valor, 0)

/** Monta a grade de itens (cor + tamanho) para o produto selecionado,
 * preservando quantidades já informadas para combinações que continuam
 * válidas. Produtos sem variações cadastradas usam um único item. */
function itensParaProduto(
  produto: Material | undefined,
  existentes: ItemOrdemProducao[],
): ItemOrdemProducao[] {
  const variacoes = produto?.variations ?? []
  if (!variacoes.length)
    return [{ variationId: undefined, quantity: existentes[0]?.quantity ?? 0 }]
  return variacoes.map((variacao) => ({
    variationId: variacao.id,
    quantity:
      existentes.find((item) => item.variationId === variacao.id)?.quantity ??
      0,
  }))
}

export function FormularioAberturaOP({
  initial,
  onClose,
  returnFocus,
}: {
  initial: Partial<OrdemProducao>
  onClose: () => void
  returnFocus: () => void
}) {
  const { data, save } = useErp()
  const produtos = (data?.materials ?? []).filter(
    (material) => material.category === "Produto pronto",
  )
  const produtoInicial = produtos.find((row) => row.id === initial.productId)
  const form = useForm<Valores>({
    resolver: zodResolver(ordemProducaoSchema),
    defaultValues: {
      code:
        initial.code ??
        `OP-${String((data?.productions.length ?? 0) + 1).padStart(4, "0")}`,
      productId: initial.productId ?? "",
      items: itensParaProduto(produtoInicial, initial.items ?? []),
      startDate: initial.startDate ?? hoje(),
      dueDate: initial.dueDate ?? "",
      responsible: initial.responsible ?? "",
      status: initial.status ?? "Planejada",
      notes: initial.notes ?? "",
    },
  })
  const valores = useWatch({ control: form.control })
  const salvando = form.formState.isSubmitting
  if (!data) return null

  const produto = produtos.find((row) => row.id === valores.productId)
  const variacoes = produto?.variations ?? []
  const itensAtuais = (valores.items ?? []) as Valores["items"]
  const tamanhos = [...new Set(variacoes.map((row) => row.size))]
  const cores = [...new Set(variacoes.map((row) => row.color))]
  const quantidadeTotal = itensAtuais.reduce(
    (total, item) =>
      total + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0,
  )
  const indiceDaVariacao = (variationId: string) =>
    variacoes.findIndex((row) => row.id === variationId)
  const totalPorCor = (cor: string) =>
    variacoes
      .filter((row) => row.color === cor)
      .reduce(
        (total, row) =>
          total +
          (Number(itensAtuais[indiceDaVariacao(row.id)]?.quantity) || 0),
        0,
      )
  const totalPorTamanho = (tamanho: string) =>
    variacoes
      .filter((row) => row.size === tamanho)
      .reduce(
        (total, row) =>
          total +
          (Number(itensAtuais[indiceDaVariacao(row.id)]?.quantity) || 0),
        0,
      )

  const insumos = calcularDisponibilidadeInsumos(
    data,
    valores.productId ?? "",
    quantidadeTotal,
  )
  const insumosInsuficientes = insumos.filter(
    (row) => row.situacao === "Insuficiente",
  )

  async function salvar(valoresForm: Valores) {
    try {
      await save("productions", valoresForm, initial.id)
      toast.success(
        initial.id
          ? "Ordem de produção atualizada."
          : "Ordem de produção aberta.",
      )
      onClose()
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Não foi possível abrir a ordem de produção."
      form.setError("root.server", { message: mensagem })
      toast.error(mensagem)
    }
  }

  function campo(
    nome: "code" | "productId" | "dueDate" | "responsible",
    rotulo: string,
    configuracao: {
      tipo?: "date"
      opcoes?: Option[]
      aoAlterar?: (valor: string) => void
      min?: string
      disabled?: boolean
    } = {},
  ) {
    const erro = form.getFieldState(nome, form.formState).error
    const id = `op-${nome}`
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
                disabled={salvando || configuracao.disabled}
              />
            )}
          />
        ) : (
          <Input
            id={id}
            type={configuracao.tipo ?? "text"}
            min={configuracao.min}
            disabled={salvando || configuracao.disabled}
            aria-invalid={!!erro}
            aria-describedby={erro ? `${id}-erro` : undefined}
            {...form.register(nome)}
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
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2.5">
                <Factory className="size-5" />
              </div>
              <div className="space-y-1.5">
                <DialogTitle className="text-xl">
                  {initial.id
                    ? "Editar ordem de produção"
                    : "Abertura de ordem de produção"}
                </DialogTitle>
                <DialogDescription>
                  Planeje o produto, as quantidades e o prazo, e confira os
                  insumos antes de abrir a ordem.
                </DialogDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Fechar"
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
              className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
            >
              <div className="min-w-0 space-y-6">
                <section aria-labelledby="dados-op" className="space-y-4">
                  <div>
                    <h2 id="dados-op" className="font-semibold">
                      Dados da ordem
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Campos com * são obrigatórios. A data de abertura é
                      registrada automaticamente.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {campo("code", "Código da ordem")}
                    {campo("productId", "Produto pronto", {
                      opcoes: produtos.map((row) => ({
                        value: row.id,
                        label: `${row.name} · ${row.code}`,
                      })),
                      aoAlterar: (id) => {
                        const escolhido = produtos.find((row) => row.id === id)
                        form.setValue(
                          "items",
                          itensParaProduto(escolhido, itensAtuais),
                          { shouldDirty: true },
                        )
                        form.clearErrors("items")
                      },
                    })}
                    <Field>
                      <FieldLabel htmlFor="op-abertura">
                        Data de abertura
                      </FieldLabel>
                      <Input
                        id="op-abertura"
                        readOnly
                        disabled
                        value={rotuloData(valores.startDate ?? hoje())}
                      />
                    </Field>
                  </div>
                  {!produtos.length && (
                    <Alert>
                      <Package />
                      <AlertTitle>Nenhum produto pronto cadastrado</AlertTitle>
                      <AlertDescription>
                        Cadastre um produto pronto no estoque para poder abrir
                        uma ordem de produção.
                      </AlertDescription>
                    </Alert>
                  )}
                </section>

                <section aria-labelledby="quantidades-op" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="quantidades-op" className="font-semibold">
                      Quantidade por cor e tamanho
                    </h2>
                    {!!produto && (
                      <Badge variant="secondary">
                        Total: {quantidade(quantidadeTotal)} peças
                      </Badge>
                    )}
                  </div>
                  {!produto ? (
                    <Empty className="border border-dashed">
                      <EmptyHeader>
                        <EmptyTitle>Selecione um produto</EmptyTitle>
                        <EmptyDescription>
                          As combinações de cor e tamanho cadastradas para o
                          produto aparecerão aqui.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : !variacoes.length ? (
                    <Field data-invalid={!!form.formState.errors.items}>
                      <FieldLabel htmlFor="op-quantidade-unica">
                        Quantidade de peças *
                      </FieldLabel>
                      <Input
                        id="op-quantidade-unica"
                        type="number"
                        min={0}
                        step={1}
                        {...form.register("items.0.quantity", {
                          valueAsNumber: true,
                        })}
                      />
                      <p className="text-xs text-muted-foreground">
                        Este produto não tem combinações de cor e tamanho
                        cadastradas.
                      </p>
                    </Field>
                  ) : (
                    <div className="overflow-hidden overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Cor</TableHead>
                            {tamanhos.map((tamanho) => (
                              <TableHead key={tamanho} className="text-right">
                                {tamanho}
                              </TableHead>
                            ))}
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cores.map((cor) => (
                            <TableRow key={cor}>
                              <TableCell className="font-medium">
                                {cor}
                              </TableCell>
                              {tamanhos.map((tamanho) => {
                                const variacao = variacoes.find(
                                  (row) =>
                                    row.color === cor && row.size === tamanho,
                                )
                                if (!variacao)
                                  return (
                                    <TableCell
                                      key={tamanho}
                                      className="text-center text-muted-foreground"
                                    >
                                      —
                                    </TableCell>
                                  )
                                const indice = indiceDaVariacao(variacao.id)
                                return (
                                  <TableCell key={tamanho} className="w-28">
                                    <Input
                                      type="number"
                                      min={0}
                                      step={1}
                                      className="text-right tabular-nums"
                                      aria-label={`Quantidade ${cor} ${tamanho}`}
                                      {...form.register(
                                        `items.${indice}.quantity`,
                                        { valueAsNumber: true },
                                      )}
                                    />
                                  </TableCell>
                                )
                              })}
                              <TableCell className="text-right font-medium tabular-nums">
                                {quantidade(totalPorCor(cor))}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-medium">Total</TableCell>
                            {tamanhos.map((tamanho) => (
                              <TableCell
                                key={tamanho}
                                className="text-right font-medium tabular-nums"
                              >
                                {quantidade(totalPorTamanho(tamanho))}
                              </TableCell>
                            ))}
                            <TableCell className="text-right font-semibold tabular-nums">
                              {quantidade(quantidadeTotal)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {form.formState.errors.items && (
                    <FieldError>
                      Informe ao menos uma quantidade maior que zero, sem
                      valores negativos ou inválidos.
                    </FieldError>
                  )}
                </section>

                <section aria-labelledby="prazo-op" className="space-y-4">
                  <h2 id="prazo-op" className="font-semibold">
                    Prazo e responsável
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {campo("dueDate", "Prazo de produção", {
                      tipo: "date",
                      min: valores.startDate,
                    })}
                    {campo("responsible", "Responsável", {
                      opcoes: responsaveisDisponiveis.map((row) => ({
                        value: row.id,
                        label: row.name,
                      })),
                    })}
                  </div>
                  <Field>
                    <FieldLabel htmlFor="op-notas">
                      Observações (opcional)
                    </FieldLabel>
                    <Textarea id="op-notas" {...form.register("notes")} />
                    {form.formState.errors.notes && (
                      <FieldError>
                        {form.formState.errors.notes.message}
                      </FieldError>
                    )}
                  </Field>
                </section>

                <section aria-labelledby="insumos-op" className="space-y-4">
                  <h2 id="insumos-op" className="font-semibold">
                    Disponibilidade de insumos
                  </h2>
                  {!produto || quantidadeTotal <= 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Selecione o produto e informe as quantidades para
                      verificar os insumos necessários.
                    </p>
                  ) : !insumos.length ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum insumo configurado para este produto.
                    </p>
                  ) : (
                    <>
                      {!!insumosInsuficientes.length && (
                        <Alert variant="destructive">
                          <AlertTriangle />
                          <AlertTitle>⚠ Insumo insuficiente</AlertTitle>
                          <AlertDescription>
                            {insumosInsuficientes.length} insumo(s) não têm
                            saldo suficiente para esta produção. Você ainda pode
                            abrir a ordem; ajuste o planejamento de compras
                            conforme necessário.
                          </AlertDescription>
                        </Alert>
                      )}
                      <div className="overflow-hidden rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Insumo</TableHead>
                              <TableHead className="text-right">
                                Necessário
                              </TableHead>
                              <TableHead className="text-right">
                                Disponível
                              </TableHead>
                              <TableHead className="text-right">
                                Diferença
                              </TableHead>
                              <TableHead>Situação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insumos.map((linha) => (
                              <TableRow key={linha.materialId}>
                                <TableCell className="font-medium">
                                  {linha.name}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatarQuantidade(linha.necessario)}{" "}
                                  {linha.unit}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatarQuantidade(linha.disponivel)}{" "}
                                  {linha.unit}
                                </TableCell>
                                <TableCell
                                  className={
                                    "text-right tabular-nums " +
                                    (linha.diferenca < 0
                                      ? "text-destructive"
                                      : "")
                                  }
                                >
                                  {linha.diferenca > 0 ? "+" : ""}
                                  {formatarQuantidade(linha.diferenca)}{" "}
                                  {linha.unit}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      linha.situacao === "Insuficiente"
                                        ? "destructive"
                                        : "outline"
                                    }
                                  >
                                    {linha.situacao === "Suficiente" ? (
                                      <Check />
                                    ) : (
                                      <AlertTriangle />
                                    )}
                                    {linha.situacao}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Verificação informativa a partir da composição cadastrada do
                    produto. Nesta etapa não há baixa, reserva ou movimentação
                    de estoque.
                  </p>
                </section>
              </div>

              <aside
                aria-label="Resumo da ordem"
                className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Resumo antes de abrir</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Produto</dt>
                        <dd className="text-right">
                          {produto?.name ?? "A selecionar"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">
                          Quantidade total
                        </dt>
                        <dd className="tabular-nums">
                          {quantidade(quantidadeTotal)} peças
                        </dd>
                      </div>
                      {!!cores.length && (
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">Por cor</dt>
                          {cores.map((cor) => (
                            <dd
                              key={cor}
                              className="flex justify-between gap-2 tabular-nums"
                            >
                              <span>{cor}</span>
                              <span>{quantidade(totalPorCor(cor))}</span>
                            </dd>
                          ))}
                        </div>
                      )}
                      {!!tamanhos.length && (
                        <div className="space-y-1">
                          <dt className="text-muted-foreground">Por tamanho</dt>
                          {tamanhos.map((tamanho) => (
                            <dd
                              key={tamanho}
                              className="flex justify-between gap-2 tabular-nums"
                            >
                              <span>{tamanho}</span>
                              <span>
                                {quantidade(totalPorTamanho(tamanho))}
                              </span>
                            </dd>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Prazo</dt>
                        <dd>
                          {valores.dueDate
                            ? rotuloData(valores.dueDate)
                            : "A definir"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">Responsável</dt>
                        <dd className="text-right">
                          {responsaveisDisponiveis.find(
                            (row) => row.id === valores.responsible,
                          )?.name ?? "A definir"}
                        </dd>
                      </div>
                    </dl>
                    {!!insumos.length && (
                      <div className="border-t pt-3 text-sm">
                        <p className="text-muted-foreground">
                          Insumos necessários
                        </p>
                        <p className="mt-1">
                          {insumos.length} insumo(s) verificado(s)
                          {insumosInsuficientes.length
                            ? ` · ${insumosInsuficientes.length} insuficiente(s)`
                            : " · disponibilidade suficiente"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {!!insumosInsuficientes.length && (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertTitle>Revise os insumos</AlertTitle>
                    <AlertDescription>
                      Há insumos sem saldo suficiente. Você ainda pode abrir a
                      ordem de produção.
                    </AlertDescription>
                  </Alert>
                )}
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
                  : "Abrir Ordem de Produção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
