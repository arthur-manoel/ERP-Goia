"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { Calculator, Layers3 } from "lucide-react"
import { useEffect } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarMoeda } from "@/lib/formatacao"
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
import {
  calcularPrecoVenda,
  chaveVariacao,
  coresDisponiveis,
  opcoesCategoria,
  opcoesUnidade,
  produtoProntoSchema,
  tamanhosDisponiveis,
  type ProdutoPronto,
  type ProdutoProntoFormulario,
  type VariacaoProduto,
} from "../schemas"

type FormularioProdutoProntoProps = {
  produto?: ProdutoPronto
  aberto: boolean
  aoFechar: () => void
  aoSalvar: (dados: ProdutoProntoFormulario) => void
}

function montarGrade(
  cores: string[],
  tamanhos: string[],
  gradeAtual: VariacaoProduto[] = [],
) {
  const saldos = new Map(
    gradeAtual.map((variacao) => [
      chaveVariacao(variacao.corId, variacao.tamanhoId),
      variacao.saldo,
    ]),
  )

  return cores.flatMap((corId) =>
    tamanhos.map((tamanhoId) => ({
      corId,
      tamanhoId,
      saldo: saldos.get(chaveVariacao(corId, tamanhoId)) ?? 0,
    })),
  )
}

function valoresIniciais(produto?: ProdutoPronto): ProdutoProntoFormulario {
  const cores = produto
    ? [...new Set(produto.variacoes.map((variacao) => variacao.corId))]
    : []
  const tamanhos = produto
    ? [...new Set(produto.variacoes.map((variacao) => variacao.tamanhoId))]
    : []

  return {
    nome: produto?.nome ?? "",
    sku: produto?.sku ?? "",
    categoria: produto?.categoria ?? "",
    unidade: produto?.unidade ?? "pc",
    precoCusto: produto?.precoCusto ?? 0,
    margemLucro: produto?.margemLucro ?? 0,
    cores,
    tamanhos,
    grade: montarGrade(cores, tamanhos, produto?.variacoes),
  }
}

export function FormularioProdutoPronto({
  produto,
  aberto,
  aoFechar,
  aoSalvar,
}: FormularioProdutoProntoProps) {
  const formulario = useForm<ProdutoProntoFormulario>({
    resolver: zodResolver(produtoProntoSchema),
    defaultValues: valoresIniciais(produto),
  })

  useEffect(() => {
    if (aberto) formulario.reset(valoresIniciais(produto))
  }, [aberto, formulario, produto])

  const cores = useWatch({ control: formulario.control, name: "cores" }) ?? []
  const tamanhos =
    useWatch({ control: formulario.control, name: "tamanhos" }) ?? []
  const grade = useWatch({ control: formulario.control, name: "grade" }) ?? []
  const precoCusto = useWatch({
    control: formulario.control,
    name: "precoCusto",
  })
  const margemLucro = useWatch({
    control: formulario.control,
    name: "margemLucro",
  })
  const precoVenda = calcularPrecoVenda(
    Number(precoCusto) || 0,
    Number(margemLucro) || 0,
  )

  function alternarOpcao(
    campo: "cores" | "tamanhos",
    id: string,
    marcado: boolean,
  ) {
    const atuais = formulario.getValues(campo)
    const proximo = marcado
      ? [...atuais, id]
      : atuais.filter((valor) => valor !== id)
    const valores = formulario.getValues()
    const proximasCores = campo === "cores" ? proximo : valores.cores
    const proximosTamanhos = campo === "tamanhos" ? proximo : valores.tamanhos

    formulario.setValue(campo, proximo, {
      shouldDirty: true,
      shouldValidate: true,
    })
    formulario.setValue(
      "grade",
      montarGrade(proximasCores, proximosTamanhos, valores.grade),
      {
        shouldDirty: true,
        shouldValidate: true,
      },
    )
  }

  function enviar(dados: ProdutoProntoFormulario) {
    aoSalvar({
      ...dados,
      grade: montarGrade(dados.cores, dados.tamanhos, dados.grade),
    })
    formulario.reset()
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(proximoAberto) => !proximoAberto && aoFechar()}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {produto ? "Editar produto pronto" : "Novo produto pronto"}
          </DialogTitle>
          <DialogDescription>
            Defina os dados comerciais e monte a grade de saldo inicial por cor
            e tamanho.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-6" onSubmit={formulario.handleSubmit(enviar)}>
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="size-4" /> Dados do produto
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(formulario.formState.errors.nome)}>
                <FieldLabel htmlFor="produto-nome">Nome do produto</FieldLabel>
                <Input
                  id="produto-nome"
                  placeholder="Ex.: Camiseta básica"
                  {...formulario.register("nome")}
                />
                <FieldError>
                  {formulario.formState.errors.nome?.message}
                </FieldError>
              </Field>
              <Field data-invalid={Boolean(formulario.formState.errors.sku)}>
                <FieldLabel htmlFor="produto-sku">Código/SKU</FieldLabel>
                <Input
                  id="produto-sku"
                  placeholder="Ex.: CAM-001"
                  {...formulario.register("sku")}
                />
                <FieldError>
                  {formulario.formState.errors.sku?.message}
                </FieldError>
              </Field>
              <Field
                data-invalid={Boolean(formulario.formState.errors.categoria)}
              >
                <FieldLabel htmlFor="produto-categoria">Categoria</FieldLabel>
                <Controller
                  control={formulario.control}
                  name="categoria"
                  render={({ field }) => (
                    <SearchSelect
                      id="produto-categoria"
                      options={opcoesCategoria}
                      placeholder="Selecione a categoria"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldError>
                  {formulario.formState.errors.categoria?.message}
                </FieldError>
              </Field>
              <Field
                data-invalid={Boolean(formulario.formState.errors.unidade)}
              >
                <FieldLabel htmlFor="produto-unidade">
                  Unidade de medida
                </FieldLabel>
                <Controller
                  control={formulario.control}
                  name="unidade"
                  render={({ field }) => (
                    <SearchSelect
                      id="produto-unidade"
                      options={opcoesUnidade}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldError>
                  {formulario.formState.errors.unidade?.message}
                </FieldError>
              </Field>
              <Field
                data-invalid={Boolean(formulario.formState.errors.precoCusto)}
              >
                <FieldLabel htmlFor="produto-custo">Preço de custo</FieldLabel>
                <Input
                  id="produto-custo"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  className="tabular-nums"
                  {...formulario.register("precoCusto", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError>
                  {formulario.formState.errors.precoCusto?.message}
                </FieldError>
              </Field>
              <Field
                data-invalid={Boolean(formulario.formState.errors.margemLucro)}
              >
                <FieldLabel htmlFor="produto-margem">
                  Margem de lucro (%)
                </FieldLabel>
                <Input
                  id="produto-margem"
                  type="number"
                  min="0"
                  max="99.99"
                  step="0.01"
                  inputMode="decimal"
                  className="tabular-nums"
                  {...formulario.register("margemLucro", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError>
                  {formulario.formState.errors.margemLucro?.message}
                </FieldError>
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="produto-venda">
                  Preço de venda calculado
                </FieldLabel>
                <Input
                  id="produto-venda"
                  className="tabular-nums"
                  readOnly
                  value={formatarMoeda(precoVenda)}
                />
                <p className="text-xs text-muted-foreground">
                  Custo ÷ (1 − margem ÷ 100).
                </p>
              </Field>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers3 className="size-4" /> Configuração da grade
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field data-invalid={Boolean(formulario.formState.errors.cores)}>
                <FieldLabel>Cores disponíveis</FieldLabel>
                <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                  {coresDisponiveis.map((cor) => (
                    <label
                      key={cor.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={cores.includes(cor.id)}
                        onCheckedChange={(marcado) =>
                          alternarOpcao("cores", cor.id, marcado === true)
                        }
                      />
                      <span
                        className="size-3 rounded-full border"
                        style={{ backgroundColor: cor.hexadecimal }}
                      />
                      {cor.nome}
                    </label>
                  ))}
                </div>
                <FieldError>
                  {formulario.formState.errors.cores?.message}
                </FieldError>
              </Field>
              <Field
                data-invalid={Boolean(formulario.formState.errors.tamanhos)}
              >
                <FieldLabel>Tamanhos disponíveis</FieldLabel>
                <div className="grid grid-cols-3 gap-2 rounded-lg border p-3">
                  {tamanhosDisponiveis.map((tamanho) => (
                    <label
                      key={tamanho.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={tamanhos.includes(tamanho.id)}
                        onCheckedChange={(marcado) =>
                          alternarOpcao(
                            "tamanhos",
                            tamanho.id,
                            marcado === true,
                          )
                        }
                      />
                      {tamanho.nome}
                    </label>
                  ))}
                </div>
                <FieldError>
                  {formulario.formState.errors.tamanhos?.message}
                </FieldError>
              </Field>
            </div>

            {cores.length > 0 && tamanhos.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cor / Tamanho</TableHead>
                      {tamanhos.map((tamanhoId) => (
                        <TableHead key={tamanhoId} className="text-center">
                          {
                            tamanhosDisponiveis.find(
                              (tamanho) => tamanho.id === tamanhoId,
                            )?.nome
                          }
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cores.map((corId) => {
                      const cor = coresDisponiveis.find(
                        (item) => item.id === corId,
                      )
                      return (
                        <TableRow key={corId}>
                          <TableCell className="font-medium">
                            <span
                              className="mr-2 inline-block size-3 rounded-full border"
                              style={{ backgroundColor: cor?.hexadecimal }}
                            />
                            {cor?.nome}
                          </TableCell>
                          {tamanhos.map((tamanhoId) => {
                            const indice = grade.findIndex(
                              (variacao) =>
                                variacao.corId === corId &&
                                variacao.tamanhoId === tamanhoId,
                            )
                            return (
                              <TableCell key={tamanhoId} className="min-w-28">
                                {indice >= 0 && (
                                  <Input
                                    aria-label={`Saldo inicial ${cor?.nome}, ${tamanhosDisponiveis.find((tamanho) => tamanho.id === tamanhoId)?.nome}`}
                                    type="number"
                                    min="0"
                                    step="1"
                                    className="h-8 text-center tabular-nums"
                                    {...formulario.register(
                                      `grade.${indice}.saldo`,
                                      { valueAsNumber: true },
                                    )}
                                  />
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Selecione ao menos uma cor e um tamanho para gerar a matriz da
                grade.
              </p>
            )}
            <FieldError>
              {formulario.formState.errors.grade?.message}
            </FieldError>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit">
              {produto ? "Salvar alterações" : "Cadastrar produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
